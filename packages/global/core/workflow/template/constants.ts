import { SystemConfigNode } from './system/systemConfig';
import { PluginConfigNode } from './system/pluginConfig';
import { EmptyNode } from './system/emptyNode';
import { WorkflowStart } from './system/workflowStart';
import { AiChatModule } from './system/aiChat';
import { DatasetSearchModule } from './system/datasetSearch';
import { DatasetConcatModule } from './system/datasetConcat';
import { AssignedAnswerModule } from './system/assignedAnswer';
import { ClassifyQuestionModule } from './system/classifyQuestion/index';
import { ContextExtractModule } from './system/contextExtract/index';
import { HttpNode468 } from './system/http468';

import { ToolModule } from './system/tools';
import { AgentChatModule } from './system/agentChat';
import { StopToolNode } from './system/stopTool';

import { RunAppModule } from './system/abandoned/runApp/index';
import { PluginInputModule } from './system/pluginInput';
import { PluginOutputModule } from './system/pluginOutput';
import { RunPluginModule } from './system/runPlugin';
import { RunAppNode } from './system/runApp';
import { AiQueryExtension } from './system/queryExtension';
import { TimeSemanticParseModule } from './system/timeSemanticParse';

import type { FlowNodeTemplateType } from '../type/node';
import { IfElseNode } from './system/ifElse/index';
import { VariableUpdateNode } from './system/variableUpdate';
import { CodeNode } from './system/sandbox';
import { CodeGeneratorModule } from './system/codeGenerator';
import { CodeInterpreterModule } from './system/codeInterpreter';
import { TextEditorNode } from './system/textEditor';
import { CustomFeedbackNode } from './system/customFeedback';
import { ReadFilesNodes } from './system/readFiles';
import { UserSelectNode } from './system/userSelect/index';
import { ToolSetNode } from './system/toolSet';
import { RunToolNode } from './system/runTool';
import { DatabaseConnectorModule } from './system/databaseConnector';
import { NL2SQLModule } from './system/nl2sql';
import { TerminateWorkflowModule } from './system/terminateWorkflow';

const systemNodes: FlowNodeTemplateType[] = [
  AiChatModule,
  TextEditorNode,
  AssignedAnswerModule,
  DatasetSearchModule,
  DatasetConcatModule,
  ToolModule,
  AgentChatModule,
  ToolSetNode,
  StopToolNode,
  ClassifyQuestionModule,
  ContextExtractModule,
  NL2SQLModule,
  ReadFilesNodes,
  DatabaseConnectorModule,
  HttpNode468,
  AiQueryExtension,
  TimeSemanticParseModule,
  IfElseNode,
  VariableUpdateNode,
  CodeNode,
  CodeGeneratorModule,
  CodeInterpreterModule,
  TerminateWorkflowModule
];
/* app flow module templates */
export const appSystemModuleTemplates: FlowNodeTemplateType[] = [
  SystemConfigNode,
  WorkflowStart,
  ...systemNodes,
  CustomFeedbackNode,
  UserSelectNode
];
/* plugin flow module templates */
export const pluginSystemModuleTemplates: FlowNodeTemplateType[] = [
  PluginConfigNode,
  PluginInputModule,
  PluginOutputModule,
  ...systemNodes
];

/* all module */
export const moduleTemplatesFlat: FlowNodeTemplateType[] = [
  ...appSystemModuleTemplates.concat(
    pluginSystemModuleTemplates.filter(
      (item) => !appSystemModuleTemplates.find((app) => app.id === item.id)
    )
  ),
  EmptyNode,
  RunPluginModule,
  RunAppNode,
  RunAppModule,
  ToolSetNode,
  RunToolNode
];
