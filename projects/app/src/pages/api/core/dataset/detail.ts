import { getLLMModelWithDefault, getVectorModelWithDefault } from '@fastgpt/service/core/ai/model';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { NextAPI } from '@/service/middleware/entry';
import { DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import type { LLMModelItemType, VectorModelItemType } from '@fastgpt/global/core/ai/model.d';
import type { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';
import type { OCRModelSchema, PDFModelSchema } from '@fastgpt/global/core/model/type.d';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { MongoOCRModel } from '@fastgpt/service/core/model/ocrSchema';
import { MongoPDFModel } from '@fastgpt/service/core/model/pdfSchema';
import { PdfParserType } from '@fastgpt/service/common/pdf/types';

type Query = {
  id: string;
};

// 仅用于当前接口返回的精确类型，避免与全局 DatasetItemType 冲突
type DatasetDetailItemType = Omit<
  DatasetSchemaType,
  'vectorModel' | 'agentModel' | 'ocrModel' | 'pdfModel'
> & {
  vectorModel: VectorModelItemType;
  agentModel: LLMModelItemType;
  ocrModel?: { model: string; name: string; charsPointsPrice: number };
  pdfModel?: {
    model: string;
    name: string;
    charsPointsPrice: number;
    type: PdfParserType;
  };
  permission: DatasetPermission;
};

async function handler(req: ApiRequestProps<Query>): Promise<DatasetDetailItemType> {
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
  const pdf = dataset.pdfModel
    ? ((await MongoPDFModel.findOne({
        model: dataset.pdfModel,
        isActive: true
      }).lean()) as PDFModelSchema | null)
    : null;

  const { ocrModel: _ocrModel, pdfModel: _pdfModel, ...rest } = dataset as DatasetSchemaType;
  return {
    ...rest,
    permission,
    vectorModel: getVectorModelWithDefault(dataset.vectorModel),
    agentModel: getLLMModelWithDefault(dataset.agentModel),
    ...(ocr
      ? { ocrModel: { model: ocr.model, name: ocr.name, charsPointsPrice: ocr.charsPointsPrice } }
      : {}),
    ...(pdf
      ? {
          pdfModel: {
            model: pdf.model,
            name: pdf.name,
            charsPointsPrice: pdf.charsPointsPrice,
            type: pdf.type
          }
        }
      : {})
  };
}

export default NextAPI(handler);
