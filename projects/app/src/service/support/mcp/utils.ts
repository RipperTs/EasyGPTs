import { MongoMcpKey } from '@fastgpt/service/support/mcp/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { authAppByTmbId } from '@fastgpt/service/support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { getAppLatestVersion } from '@fastgpt/service/core/app/controller';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { type AppChatConfigType } from '@fastgpt/global/core/app/type';
import { type FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { type AppSchema } from '@fastgpt/global/core/app/type';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import type { AIChatItemType, UserChatItemType } from '@fastgpt/global/core/chat/type';
import {
  getWorkflowEntryNodeIds,
  storeEdges2RuntimeEdges,
  storeNodes2RuntimeNodes
} from '@fastgpt/global/core/workflow/runtime/utils';
import { WORKFLOW_MAX_RUN_TIMES } from '@fastgpt/service/core/workflow/constants';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { getChatTitleFromChatMessage, removeEmptyUserInput } from '@fastgpt/global/core/chat/utils';
import { saveChat } from '@fastgpt/service/core/chat/saveChat';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import {
  ChatRoleEnum,
  ChatItemValueTypeEnum,
  ChatSourceEnum
} from '@fastgpt/global/core/chat/constants';
import { getPluginRunUserQuery } from '@fastgpt/service/core/workflow/utils';
import { updatePluginInputByVariables } from '@fastgpt/global/core/workflow/utils';
import { getPluginInputsFromStoreNodes } from '@fastgpt/global/core/app/plugin/utils';
import { getTmbInfoByTmbId } from '@fastgpt/service/support/user/team/controller';
import { getUserDetail } from '@fastgpt/service/support/user/controller';

// 简化版 JSON Schema 映射（覆盖常用类型）
const valueTypeJsonSchemaMap: Record<string, any> = {
  string: { type: 'string' },
  number: { type: 'number' },
  boolean: { type: 'boolean' },
  object: { type: 'object' },
  arrayString: { type: 'array', items: { type: 'string' } },
  arrayNumber: { type: 'array', items: { type: 'number' } },
  arrayBoolean: { type: 'array', items: { type: 'boolean' } },
  arrayObject: { type: 'array', items: { type: 'object' } }
};

export const pluginNodes2InputSchema = (
  nodes: { flowNodeType: FlowNodeTypeEnum; inputs: FlowNodeInputItemType[] }[]
) => {
  const pluginInput = nodes.find((n) => n.flowNodeType === FlowNodeTypeEnum.pluginInput);
  const schema: any = { type: 'object', properties: {}, required: [] };
  pluginInput?.inputs.forEach((input) => {
    const jsonSchema = valueTypeJsonSchemaMap[input.valueType || 'string'] || { type: 'string' };
    schema.properties[input.key] = {
      ...jsonSchema,
      description: input.description,
      enum: (input as any)?.enum?.split('\n').filter(Boolean) || undefined
    };
    if (input.required) schema.required.push(input.key);
  });
  return schema;
};

export const workflow2InputSchema = (chatConfig?: {
  fileSelectConfig?: AppChatConfigType['fileSelectConfig'];
  variables?: AppChatConfigType['variables'];
}) => {
  const schema: any = {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'Question from user' },
      ...(chatConfig?.fileSelectConfig?.canSelectFile || chatConfig?.fileSelectConfig?.canSelectImg
        ? {
            fileUrlList: { type: 'array', items: { type: 'string' }, description: 'File linkage' }
          }
        : {})
    },
    required: ['question']
  };
  chatConfig?.variables?.forEach((item) => {
    const jsonSchema = valueTypeJsonSchemaMap[item.valueType || 'string'] || { type: 'string' };
    schema.properties[item.key] = {
      ...jsonSchema,
      description: (item as any).description || item.label,
      enum: item.enums?.map((x) => x.value) || undefined
    };
    if (item.required) schema.required.push(item.key);
  });
  return schema;
};

export const getMcpServerTools = async (key: string) => {
  const mcp = (await MongoMcpKey.findOne({ key }, { apps: 1, tmbId: 1 }).lean()) as any;
  if (!mcp) throw new Error('invalid mcp key');

  const appList = (await MongoApp.find(
    { _id: { $in: mcp.apps.map((a: any) => a.appId) } },
    { name: 1, intro: 1 }
  ).lean()) as any[];

  const permissionAppList = (
    await Promise.all(
      appList.map(async (app) => {
        try {
          await authAppByTmbId({ tmbId: mcp.tmbId, appId: app._id, per: ReadPermissionVal });
          return app;
        } catch {
          return null as any;
        }
      })
    )
  ).filter(Boolean);

  const versionList = await Promise.all(
    permissionAppList.map((app: any) => getAppLatestVersion(app._id, app))
  );

  return versionList.map((version, index) => {
    const app = permissionAppList[index] as any;
    const mcpApp = mcp.apps.find((x: any) => String(x.appId) === String(app._id))!;
    const isPlugin = !!version.nodes.find(
      (n: any) => n.flowNodeType === FlowNodeTypeEnum.pluginInput
    );
    return {
      name: mcpApp.toolName,
      description: mcpApp.description,
      inputSchema: isPlugin
        ? pluginNodes2InputSchema(version.nodes)
        : workflow2InputSchema(version.chatConfig)
    };
  });
};

export const callMcpServerTool = async ({
  key,
  toolName,
  inputs
}: {
  key: string;
  toolName: string;
  inputs: Record<string, any>;
}) => {
  const dispatchApp = async (app: AppSchema, variables: Record<string, any>) => {
    const isPlugin = app.type === 'plugin';
    const { nodes, edges, chatConfig } = await getAppLatestVersion(app._id, app);

    const userQuestion: UserChatItemType = isPlugin
      ? getPluginRunUserQuery(nodes || app.modules, variables)
      : {
          obj: ChatRoleEnum.Human,
          value: [
            { type: ChatItemValueTypeEnum.text, text: { content: variables.question } as any }
          ]
        };

    let runtimeNodes = storeNodes2RuntimeNodes(nodes, getWorkflowEntryNodeIds(nodes));
    if (isPlugin) {
      runtimeNodes = updatePluginInputByVariables(runtimeNodes, variables);
      variables = {};
    } else {
      delete variables.question;
      (variables as any).system_fileUrlList = (variables as any).fileUrlList;
      delete (variables as any).fileUrlList;
    }

    const chatId = getNanoid();

    // 运行人使用 app 所属成员
    const tmb = await getTmbInfoByTmbId({ tmbId: String(app.tmbId) });
    const user = await getUserDetail({ tmbId: tmb.tmbId });

    const { flowUsages, assistantResponses, newVariables, flowResponses } = await dispatchWorkFlow({
      user: user as any,
      chatId,
      mode: 'chat',
      usageSource: UsageSourceEnum.mcp,
      runningAppInfo: {
        id: String(app._id),
        teamId: String(app.teamId),
        tmbId: String(app.tmbId)
      },
      uid: String(app.tmbId),
      runtimeNodes,
      runtimeEdges: storeEdges2RuntimeEdges(edges),
      variables,
      query: removeEmptyUserInput(userQuestion.value),
      chatConfig,
      histories: [],
      stream: false,
      maxRunTimes: WORKFLOW_MAX_RUN_TIMES
    } as any);

    const aiResponse: AIChatItemType & { dataId?: string } = {
      obj: ChatRoleEnum.AI,
      value: assistantResponses,
      [DispatchNodeResponseKeyEnum.nodeResponse]: flowResponses
    } as any;
    const newTitle = isPlugin ? 'Mcp call' : getChatTitleFromChatMessage(userQuestion);

    await saveChat({
      chatId,
      appId: app._id,
      teamId: app.teamId as any,
      tmbId: app.tmbId as any,
      nodes,
      appChatConfig: chatConfig,
      variables: newVariables,
      isUpdateUseTime: false,
      newTitle,
      source: ChatSourceEnum.mcp,
      content: [userQuestion as any, aiResponse as any]
    });

    // 返回文本内容（非插件）或插件输出
    if (isPlugin) {
      const output = (flowResponses || []).find(
        (item: any) => item?.moduleType === FlowNodeTypeEnum.pluginOutput
      );
      return output
        ? JSON.stringify(output.pluginOutput || {})
        : 'Can not get response from plugin';
    }
    return (assistantResponses || [])
      .map((i: any) => i?.text?.content)
      .filter(Boolean)
      .join('\n');
  };

  const mcp = (await MongoMcpKey.findOne({ key }, { apps: 1 }).lean()) as any;
  if (!mcp) throw new Error('invalid mcp key');

  const appList = (await MongoApp.find({
    _id: { $in: mcp.apps.map((a: any) => a.appId) }
  }).lean()) as any[];
  const app = appList.find((app: any) => {
    const m = mcp.apps.find((x: any) => String(x.appId) === String(app._id))!;
    return toolName === m.toolName;
  });
  if (!app) throw new Error('tool not found');

  return dispatchApp(app as any, inputs);
};
