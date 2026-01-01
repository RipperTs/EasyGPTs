import { i18nT } from '../../../web/i18n/utils';

export enum FlowNodeTemplateTypeEnum {
  systemInput = 'systemInput',
  ai = 'ai',
  function = 'function',
  tools = 'tools',
  interactive = 'interactive',

  search = 'search',
  database = 'database',
  multimodal = 'multimodal',
  communication = 'communication',

  other = 'other',
  teamApp = 'teamApp'
}

export enum WorkflowIOValueTypeEnum {
  string = 'string',
  number = 'number',
  boolean = 'boolean',
  object = 'object',
  arrayString = 'arrayString',
  arrayNumber = 'arrayNumber',
  arrayBoolean = 'arrayBoolean',
  arrayObject = 'arrayObject',
  any = 'any',

  chatHistory = 'chatHistory',
  datasetQuote = 'datasetQuote',

  dynamic = 'dynamic',

  // plugin special type
  selectApp = 'selectApp',
  selectDataset = 'selectDataset'
}

// Tool 参数类型到 JSON Schema 的映射（对齐上游实现）
export const toolValueTypeList: {
  label: string;
  value: WorkflowIOValueTypeEnum;
  jsonSchema: {
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    items?: { type: 'string' | 'number' | 'boolean' | 'object' };
  };
}[] = [
  {
    label: WorkflowIOValueTypeEnum.string,
    value: WorkflowIOValueTypeEnum.string,
    jsonSchema: { type: 'string' }
  },
  {
    label: WorkflowIOValueTypeEnum.number,
    value: WorkflowIOValueTypeEnum.number,
    jsonSchema: { type: 'number' }
  },
  {
    label: WorkflowIOValueTypeEnum.boolean,
    value: WorkflowIOValueTypeEnum.boolean,
    jsonSchema: { type: 'boolean' }
  },
  {
    label: 'array<string>',
    value: WorkflowIOValueTypeEnum.arrayString,
    jsonSchema: { type: 'array', items: { type: 'string' } }
  },
  {
    label: 'array<number>',
    value: WorkflowIOValueTypeEnum.arrayNumber,
    jsonSchema: { type: 'array', items: { type: 'number' } }
  },
  {
    label: 'array<boolean>',
    value: WorkflowIOValueTypeEnum.arrayBoolean,
    jsonSchema: { type: 'array', items: { type: 'boolean' } }
  },
  {
    label: 'object',
    value: WorkflowIOValueTypeEnum.object,
    jsonSchema: { type: 'object' }
  },
  {
    label: 'array<object>',
    value: WorkflowIOValueTypeEnum.arrayObject,
    jsonSchema: { type: 'array', items: { type: 'object' } }
  }
];

export const valueTypeJsonSchemaMap: Record<
  string,
  {
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    items?: { type: 'string' | 'number' | 'boolean' | 'object' };
  }
> = toolValueTypeList.reduce(
  (acc, item) => {
    acc[item.value] = item.jsonSchema;
    return acc;
  },
  {} as Record<string, any>
);

/* reg: modulename key */
export enum NodeInputKeyEnum {
  // old
  welcomeText = 'welcomeText',
  switch = 'switch', // a trigger switch
  history = 'history',
  answerText = 'text',

  // system config
  questionGuide = 'questionGuide',
  tts = 'tts',
  whisper = 'whisper',
  variables = 'variables',
  scheduleTrigger = 'scheduleTrigger',
  chatInputGuide = 'chatInputGuide',

  // plugin config
  instruction = 'instruction',

  // entry
  userChatInput = 'userChatInput',
  inputFiles = 'inputFiles',

  agents = 'agents', // cq agent key

  // latest
  // common
  aiModel = 'model',
  aiSystemPrompt = 'systemPrompt',
  description = 'description',
  anyInput = 'system_anyInput',
  textareaInput = 'system_textareaInput',
  addInputParam = 'system_addInputParam',

  // history
  historyMaxAmount = 'maxContext',

  // ai chat
  aiChatTemperature = 'temperature',
  aiChatMaxToken = 'maxToken',
  aiChatSettingModal = 'aiSettings',
  aiChatIsResponseText = 'isResponseAnswerText',
  aiChatQuoteTemplate = 'quoteTemplate',
  aiChatQuotePrompt = 'quotePrompt',
  aiChatDatasetQuote = 'quoteQA',
  aiChatVision = 'aiChatVision',
  stringQuoteText = 'stringQuoteText',
  aiChatReasoning = 'aiChatReasoning',
  aiChatReasoningEffort = 'aiChatReasoningEffort',

  // dataset
  datasetSelectList = 'datasets',
  datasetSimilarity = 'similarity',
  datasetMaxTokens = 'limit',
  datasetSearchMode = 'searchMode',
  datasetSearchUsingReRank = 'usingReRank',
  datasetSearchUsingExtensionQuery = 'datasetSearchUsingExtensionQuery',
  datasetSearchExtensionModel = 'datasetSearchExtensionModel',
  datasetSearchExtensionBg = 'datasetSearchExtensionBg',
  collectionFilterMatch = 'collectionFilterMatch',

  // concat dataset
  datasetQuoteList = 'system_datasetQuoteList',

  // context extract
  contextExtractInput = 'content',
  extractKeys = 'extractKeys',

  // nl2sql
  nl2sqlDatabaseSchema = 'nl2sqlDatabaseSchema',
  nl2sqlRelationFields = 'nl2sqlRelationFields',
  nl2sqlUserPrompt = 'nl2sqlUserPrompt',
  nl2sqlMaxRetry = 'nl2sqlMaxRetry',

  // database connector
  databaseType = 'system_databaseType',
  databaseHost = 'system_databaseHost',
  databasePort = 'system_databasePort',
  databaseName = 'system_databaseName',
  databaseUser = 'system_databaseUser',
  databasePassword = 'system_databasePassword',
  databaseSql = 'system_databaseSql',
  databaseMaxRetry = 'system_databaseMaxRetry',
  databaseTimeout = 'system_databaseTimeout',

  // http
  httpReqUrl = 'system_httpReqUrl',
  httpHeaders = 'system_httpHeader',
  httpMethod = 'system_httpMethod',
  httpParams = 'system_httpParams',
  httpJsonBody = 'system_httpJsonBody',
  httpFormBody = 'system_httpFormBody',
  httpContentType = 'system_httpContentType',
  httpTimeout = 'system_httpTimeout',
  abandon_httpUrl = 'url',

  // app
  runAppSelectApp = 'app',

  // plugin
  pluginId = 'pluginId',
  pluginStart = 'pluginStart',

  // if else
  condition = 'condition',
  ifElseList = 'ifElseList',

  // variable update
  updateList = 'updateList',

  // code
  code = 'code',
  codeType = 'codeType', // js|py
  codeInterpreterMaxRetry = 'codeInterpreterMaxRetry',
  codeInterpreterTimeout = 'codeInterpreterTimeout',

  // read files
  fileUrlList = 'fileUrlList',
  readFilesMaxLength = 'readFilesMaxLength',

  // user select
  userSelectOptions = 'userSelectOptions',

  // terminate workflow
  terminateError = 'terminateError',

  // time semantic parse
  timeSemanticParseType = 'timeSemanticParseType',
  timeSemanticCurrentTime = 'timeSemanticCurrentTime',

  // agent chat (plan-and-execute)
  agentMaxPlanSteps = 'agentMaxPlanSteps',
  agentMaxLoops = 'agentMaxLoops',
  agentOrchestrationMode = 'agentOrchestrationMode',
  agentToolAccess = 'agentToolAccess',
  agentToolPreference = 'agentToolPreference',
  agentEnableClarify = 'agentEnableClarify',
  agentEnableWorkingMemory = 'agentEnableWorkingMemory',
  agentEnableStepMemory = 'agentEnableStepMemory',
  agentEnableCritic = 'agentEnableCritic',
  agentCriticThreshold = 'agentCriticThreshold'
}

// AI 推理强度等级
export type ReasoningEffortLevel = 'low' | 'medium' | 'high';

export enum NodeOutputKeyEnum {
  // common
  userChatInput = 'userChatInput',
  history = 'history',
  answerText = 'answerText', // 模块回答。值将显示并保存到历史记录中
  reasoningText = 'reasoningText', // 推理节点。值将会显示，但不会保存到历史记录中
  success = 'success',
  failed = 'failed',
  error = 'error',
  sql = 'sql',
  text = 'system_text',
  addOutputParam = 'system_addOutputParam',
  rawResponse = 'system_rawResponse',

  // start
  userFiles = 'userFiles',

  // code interpreter
  result = 'result',
  execution_time = 'execution_time',
  image_url = 'image_url',
  files = 'files',
  inputs = 'inputs',
  code = 'code',

  // dataset
  datasetQuoteQA = 'quoteQA',

  // classify
  cqResult = 'cqResult',
  // context extract
  contextExtractFields = 'fields',

  // database connector
  databaseQueryResult = 'databaseQueryResult',

  // tf switch
  resultTrue = 'system_resultTrue',
  resultFalse = 'system_resultFalse',

  // tools
  selectedTools = 'selectedTools',

  // http
  httpRawResponse = 'httpRawResponse',

  // plugin
  pluginStart = 'pluginStart',

  // if else
  ifElseResult = 'ifElseResult',

  //user select
  selectResult = 'selectResult',

  // time semantic parse
  timeSemanticOriginalText = 'timeSemanticOriginalText',
  timeSemanticResult = 'timeSemanticResult',
  // read files
  readFilesFileList = 'readFilesFileList'
}

export enum VariableInputEnum {
  input = 'input',
  textarea = 'textarea',
  select = 'select',
  custom = 'custom'
}
export const variableMap = {
  [VariableInputEnum.input]: {
    icon: 'core/app/variable/input',
    title: i18nT('common:core.module.variable.input type'),
    desc: ''
  },
  [VariableInputEnum.textarea]: {
    icon: 'core/app/variable/textarea',
    title: i18nT('common:core.module.variable.textarea type'),
    desc: i18nT('app:variable.textarea_type_desc')
  },
  [VariableInputEnum.select]: {
    icon: 'core/app/variable/select',
    title: i18nT('common:core.module.variable.select type'),
    desc: ''
  },
  [VariableInputEnum.custom]: {
    icon: 'core/app/variable/external',
    title: i18nT('common:core.module.variable.Custom type'),
    desc: i18nT('app:variable.select type_desc')
  }
};

/* run time */
export enum RuntimeEdgeStatusEnum {
  'waiting' = 'waiting',
  'active' = 'active',
  'skipped' = 'skipped'
}

export const VARIABLE_NODE_ID = 'VARIABLE_NODE_ID';
export const DYNAMIC_INPUT_REFERENCE_KEY = 'DYNAMIC_INPUT_REFERENCE_KEY';

// http node body content type
export enum ContentTypes {
  none = 'none',
  formData = 'form-data',
  xWwwFormUrlencoded = 'x-www-form-urlencoded',
  json = 'json',
  xml = 'xml',
  raw = 'raw-text'
}
