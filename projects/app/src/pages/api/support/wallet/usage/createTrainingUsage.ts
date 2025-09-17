import type { NextApiRequest, NextApiResponse } from 'next';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { CreateTrainingUsageProps } from '@fastgpt/global/support/wallet/usage/api.d';
import { getLLMModel, getVectorModel } from '@fastgpt/service/core/ai/model';
import { createTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { NextAPI } from '@/service/middleware/entry';

async function handler(req: NextApiRequest) {
  const { name, datasetId } = req.body as CreateTrainingUsageProps;

  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: WritePermissionVal
  });

  const vectorModelData = getVectorModel(dataset.vectorModel);
  const agentModelData = getLLMModel(dataset.agentModel);

  if (!vectorModelData) {
    return Promise.reject('Vector model not found');
  }

  if (!agentModelData) {
    return Promise.reject('Agent model not found');
  }

  const { billId } = await createTrainingUsage({
    teamId,
    tmbId,
    appName: name,
    billSource: UsageSourceEnum.training,
    vectorModel: vectorModelData.name,
    agentModel: agentModelData.name
  });

  return billId;
}

export default NextAPI(handler);
