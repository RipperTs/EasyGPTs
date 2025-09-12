import { Schema, getMongoModel } from '../../common/mongo';

// 向量模型配置
export const EmbeddingModelCollectionName = 'embedding_models';

const EmbeddingModelSchema = new Schema({
  model: {
    type: String,
    required: true,
    comment: '模型名（与OneAPI对应）'
  },
  name: {
    type: String,
    required: true,
    comment: '模型展示名'
  },
  avatar: {
    type: String,
    default: '/imgs/model/huggingface.svg',
    comment: '模型logo'
  },
  charsPointsPrice: {
    type: Number,
    default: 0,
    comment: 'n积分/1k token'
  },
  defaultToken: {
    type: Number,
    required: true,
    comment: '默认文本分割时候的 token'
  },
  maxToken: {
    type: Number,
    required: true,
    comment: '最大 token'
  },
  weight: {
    type: Number,
    default: 100,
    comment: '优先训练权重'
  },
  defaultConfig: {
    type: Object,
    default: {},
    comment: '自定义额外参数'
  },
  dbConfig: {
    type: Object,
    default: {},
    comment: '存储时的额外参数（非对称向量模型时候需要用到）'
  },
  queryConfig: {
    type: Object,
    default: {},
    comment: '查询时的额外参数'
  },
  isActive: {
    type: Boolean,
    default: true,
    comment: '是否启用'
  },
  sort: {
    type: Number,
    default: 100,
    comment: '排序字段，数字越小越靠前'
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  }
});

// 创建索引
EmbeddingModelSchema.index({ updateTime: -1 });
EmbeddingModelSchema.index({ isActive: 1, sort: 1 });
EmbeddingModelSchema.index({ model: 1 });

export const MongoEmbeddingModel = getMongoModel(
  EmbeddingModelCollectionName,
  EmbeddingModelSchema
);
