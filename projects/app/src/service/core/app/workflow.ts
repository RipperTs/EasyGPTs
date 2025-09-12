import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
import { MongoLLMModel } from '@fastgpt/service/core/model/llmSchema';

export const getChatModelNameListByModules = async (
  nodes: StoreNodeItemType[]
): Promise<string[]> => {
  // 获取所有使用的模型标识
  const modelIds = nodes
    .map((item) => item.inputs.find((input) => input.key === NodeInputKeyEnum.aiModel)?.value)
    .filter(Boolean);

  if (modelIds.length === 0) return [];

  // 从数据库批量查询模型信息（系统级共享）
  const models = await MongoLLMModel.find({
    model: { $in: modelIds },
    isActive: true
  })
    .select('model name')
    .lean();

  // 创建模型映射
  const modelMap = new Map(models.map((m) => [m.model, m.name]));

  // 返回模型名称列表
  return modelIds.map((modelId) => modelMap.get(modelId) || '').filter(Boolean);
};
