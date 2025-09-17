import {
  getLLMModel,
  getVectorModel,
  getLLMModelWithDefault,
  getVectorModelWithDefault
} from '@fastgpt/service/core/ai/model';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { NextAPI } from '@/service/middleware/entry';
import { DatasetItemType, DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import type { OCRModelSchema } from '@fastgpt/global/core/model/type.d';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { MongoOCRModel } from '@fastgpt/service/core/model/ocrSchema';

type Query = {
  id: string;
};

async function handler(req: ApiRequestProps<Query>): Promise<DatasetItemType> {
  const { id: datasetId } = req.query as {
    id: string;
  };

  if (!datasetId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // 凭证校验
  const { dataset, permission } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: ReadPermissionVal
  });

  const ocr = dataset.ocrModel
    ? ((await MongoOCRModel.findOne({
        model: dataset.ocrModel,
        isActive: true
      }).lean()) as OCRModelSchema | null)
    : null;

  const { ocrModel: _ocrModel, ...rest } = dataset as DatasetSchemaType;
  return {
    ...rest,
    permission,
    vectorModel: getVectorModelWithDefault(dataset.vectorModel),
    agentModel: getLLMModelWithDefault(dataset.agentModel),
    ...(ocr
      ? { ocrModel: { model: ocr.model, name: ocr.name, charsPointsPrice: ocr.charsPointsPrice } }
      : {})
  };
}

export default NextAPI(handler);
