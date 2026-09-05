import type { SelectedDatasetType } from '../workflow/api';
import type { FlowNodeInputItemType } from '../workflow/type/io';

export type WeKnoraConnectionConfig = {
  apiUrl: string;
  apiKey: string;
  webUrl: string;
};

export type WeKnoraConnectionInfo = Omit<WeKnoraConnectionConfig, 'apiKey'> & {
  connectionId: string;
};

export type WeKnoraConnectionParams = Omit<WeKnoraConnectionConfig, 'apiKey'> & {
  appId: string;
  connectionId?: string;
  apiKey?: string;
};

export type ValidateWeKnoraConnectionResponse = Omit<WeKnoraConnectionConfig, 'apiKey'> & {
  datasets: WeKnoraKnowledgeBase[];
};

export type WeKnoraKnowledgeBase = {
  id: string;
  name: string;
  type: string;
  tenant_id: number;
};

export type WeKnoraSearchSettings = {
  weknoraConnectionId: string;
  datasets: SelectedDatasetType;
  limit: number;
};

export const getDefaultWeKnoraSearchSettings = (): WeKnoraSearchSettings => ({
  weknoraConnectionId: '',
  datasets: [],
  limit: 1500
});

export const getWeKnoraSettingsFromInputs = (inputs: FlowNodeInputItemType[]) => {
  const settings = getDefaultWeKnoraSearchSettings();
  for (const key of Object.keys(settings)) {
    const input = inputs.find((item) => item.key === key);
    if (input) Object.assign(settings, { [key]: input.value });
  }
  return settings;
};
