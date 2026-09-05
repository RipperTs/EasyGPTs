import { DatasetSearchModeEnum } from './constants';
import type { SelectedDatasetType } from '../workflow/api';
import type { FlowNodeInputItemType } from '../workflow/type/io';

export type WeKnoraConnectionConfig = {
  apiUrl: string;
  apiKey: string;
  tenantId: string;
  webUrl: string;
};

export type WeKnoraConnectionInfo = Omit<WeKnoraConnectionConfig, 'apiKey'> & {
  connectionId: string;
};

export type SaveWeKnoraConnectionParams = Omit<WeKnoraConnectionConfig, 'apiKey'> & {
  appId: string;
  connectionId?: string;
  apiKey?: string;
};

export type SaveWeKnoraConnectionResponse = WeKnoraConnectionInfo & {
  datasets: WeKnoraKnowledgeBase[];
};

export type WeKnoraKnowledgeBase = {
  id: string;
  name: string;
  type: string;
  tenant_id: number;
  embedding_model_id: string;
  indexing_strategy: {
    vector_enabled: boolean;
    keyword_enabled: boolean;
  };
};

export type WeKnoraSearchSettings = {
  weknoraConnectionId: string;
  datasets: SelectedDatasetType;
  searchMode: `${DatasetSearchModeEnum}`;
  similarity: number;
  limit: number;
  usingReRank: boolean;
  datasetSearchUsingExtensionQuery: boolean;
  datasetSearchExtensionModel?: string;
  datasetSearchExtensionBg: string;
  weknoraMatchCount: number;
  weknoraKnowledgeIds: string[];
  weknoraTagIds: string[];
};

export const getDefaultWeKnoraSearchSettings = (): WeKnoraSearchSettings => ({
  weknoraConnectionId: '',
  datasets: [],
  searchMode: DatasetSearchModeEnum.embedding,
  similarity: 0.4,
  limit: 1500,
  usingReRank: false,
  datasetSearchUsingExtensionQuery: true,
  datasetSearchExtensionModel: '',
  datasetSearchExtensionBg: '',
  weknoraMatchCount: 20,
  weknoraKnowledgeIds: [],
  weknoraTagIds: []
});

export const getWeKnoraSettingsFromInputs = (inputs: FlowNodeInputItemType[]) => {
  const settings = getDefaultWeKnoraSearchSettings();
  for (const key of Object.keys(settings)) {
    const input = inputs.find((item) => item.key === key);
    if (input) Object.assign(settings, { [key]: input.value });
  }
  return settings;
};

export const getWeKnoraSearchModes = (datasets: WeKnoraKnowledgeBase[]) => {
  const vectorEnabled = datasets.every(
    (dataset) => dataset.indexing_strategy.vector_enabled && !!dataset.embedding_model_id
  );
  const keywordEnabled = datasets.every(
    (dataset) => dataset.indexing_strategy.keyword_enabled && dataset.type !== 'faq'
  );

  return [
    ...(vectorEnabled ? [DatasetSearchModeEnum.embedding] : []),
    ...(keywordEnabled ? [DatasetSearchModeEnum.fullTextRecall] : []),
    ...(vectorEnabled && keywordEnabled ? [DatasetSearchModeEnum.mixedRecall] : [])
  ];
};
