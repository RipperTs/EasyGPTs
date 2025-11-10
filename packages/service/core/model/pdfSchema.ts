import { Schema, getMongoModel } from '../../common/mongo';

export const PDFModelCollectionName = 'pdf_models';

const PDFModelSchema = new Schema({
  model: { type: String, required: true, comment: '模型名' },
  name: { type: String, required: true, comment: '显示名' },
  avatar: { type: String, default: '/imgs/model/llm.svg', comment: '图标' },
  charsPointsPrice: { type: Number, default: 0, comment: '价格(积分/千字符)' },
  type: {
    type: String,
    enum: ['mineru', 'doc2x', 'mineru-local'],
    required: true,
    comment: '解析类型'
  },
  requestUrl: { type: String, default: '', comment: '请求地址' },
  apiKey: { type: String, default: '', comment: '接口鉴权秘钥' },
  defaultConfig: { type: Object, default: {}, comment: '默认请求参数' },
  isActive: { type: Boolean, default: true },
  createTime: { type: Date, default: () => new Date() },
  updateTime: { type: Date, default: () => new Date() }
});

PDFModelSchema.index({ updateTime: -1 });
PDFModelSchema.index({ isActive: 1 });
PDFModelSchema.index({ model: 1 }, { unique: true });

export const MongoPDFModel = getMongoModel(PDFModelCollectionName, PDFModelSchema);
