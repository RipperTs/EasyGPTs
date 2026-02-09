import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { dispatchWorkFlow } from '../index';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { getPluginRuntimeById } from '../../../app/plugin/controller';
import {
  getWorkflowEntryNodeIds,
  initWorkflowEdgeStatus,
  storeNodes2RuntimeNodes
} from '@fastgpt/global/core/workflow/runtime/utils';
import { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { authPluginByTmbId } from '../../../../support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { computedPluginUsage } from '../../../app/plugin/utils';
import { filterSystemVariables } from '../utils';
import { getPluginRunUserQuery } from '../../utils';
import { getRuntimeGlobalVariables } from '../../../../support/globalVariable/controller';

type RunPluginProps = ModuleDispatchProps<{
  [key: string]: any;
}>;
type RunPluginResponse = DispatchNodeResultType<{}>;

const SENSITIVE_INPUT_KEYS = new Set(['password', 'private_key', 'passphrase']);

const maskPluginInputs = (inputs: Record<string, any>) => {
  return Object.keys(inputs).reduce<Record<string, any>>((acc, key) => {
    const value = inputs[key];
    if (SENSITIVE_INPUT_KEYS.has(key) && value !== undefined && value !== null && value !== '') {
      acc[key] = '[REDACTED]';
      return acc;
    }
    acc[key] = value;
    return acc;
  }, {});
};

export const dispatchRunPlugin = async (props: RunPluginProps): Promise<RunPluginResponse> => {
  const {
    node: { pluginId },
    runningAppInfo,
    mode,
    params: data // Plugin input
  } = props;

  if (!pluginId) {
    return Promise.reject('pluginId can not find');
  }

  // auth plugin
  const pluginData = await authPluginByTmbId({
    appId: pluginId,
    tmbId: runningAppInfo.tmbId,
    per: ReadPermissionVal
  });

  const plugin = await getPluginRuntimeById(pluginId);
  const globalVariables = await getRuntimeGlobalVariables({
    teamId: String(plugin.teamId || ''),
    tmbId: String(runningAppInfo.tmbId)
  });

  const runtimeNodes = storeNodes2RuntimeNodes(
    plugin.nodes,
    getWorkflowEntryNodeIds(plugin.nodes)
  ).map((node) => {
    // Update plugin input value
    if (node.flowNodeType === FlowNodeTypeEnum.pluginInput) {
      return {
        ...node,
        showStatus: false,
        inputs: node.inputs.map((input) => ({
          ...input,
          value: data[input.key] ?? input.value
        }))
      };
    }
    return {
      ...node,
      showStatus: false
    };
  });
  const runtimeVariables = {
    ...globalVariables,
    ...filterSystemVariables(props.variables),
    appId: String(plugin.id)
  };

  const { flowResponses, flowUsages, assistantResponses, runTimes, toolResponses } =
    await dispatchWorkFlow({
      ...props,
      runningAppInfo: {
        id: String(plugin.id),
        teamId: plugin.teamId || '',
        tmbId: pluginData?.tmbId || ''
      },
      variables: runtimeVariables,
      query: getPluginRunUserQuery(plugin.nodes, runtimeVariables).value,
      chatConfig: {},
      runtimeNodes,
      runtimeEdges: initWorkflowEdgeStatus(plugin.edges)
    });

  const output = flowResponses.find((item) => item.moduleType === FlowNodeTypeEnum.pluginOutput);
  const terminateToolResponse =
    toolResponses && typeof toolResponses === 'object' ? toolResponses : undefined;

  if (output) {
    output.moduleLogo = plugin.avatar;
  }

  const isError = !!(output?.pluginOutput?.error || terminateToolResponse?.error);
  const usagePoints = isError ? 0 : await computedPluginUsage(plugin, flowUsages);
  const pluginOutput = output?.pluginOutput || terminateToolResponse;

  return {
    assistantResponses,
    // responseData, // debug
    [DispatchNodeResponseKeyEnum.runTimes]: runTimes,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      moduleLogo: plugin.avatar,
      totalPoints: usagePoints,
      nodeInputs: maskPluginInputs(data),
      pluginOutput,
      pluginDetail:
        mode === 'test' && plugin.teamId === runningAppInfo.teamId
          ? flowResponses.filter((item) => {
              const filterArr = [FlowNodeTypeEnum.pluginOutput];
              return !filterArr.includes(item.moduleType as any);
            })
          : undefined
    },
    [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: [
      {
        moduleName: plugin.name,
        totalPoints: usagePoints,
        tokens: 0
      }
    ],
    [DispatchNodeResponseKeyEnum.toolResponses]: pluginOutput || {},
    ...(pluginOutput || {})
  };
};
