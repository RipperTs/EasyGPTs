import { ModelTypeEnum, getModelMap } from '../../../core/ai/model';

export const formatModelChars2Points = ({
  model,
  tokens = 0,
  modelType,
  multiple = 1000
}: {
  model: string;
  tokens: number;
  modelType: `${ModelTypeEnum}`;
  multiple?: number;
}) => {
  const modelData = getModelMap?.[modelType]?.(model);
  if (!modelData) {
    return {
      totalPoints: 0,
      modelName: ''
    };
  }

  // 类型守卫：确保 modelData 有正确的属性
  const charsPointsPrice = 'charsPointsPrice' in modelData ? modelData.charsPointsPrice : 0;
  const modelName = 'name' in modelData ? modelData.name : '';

  const totalPoints = (charsPointsPrice || 0) * (tokens / multiple);

  return {
    modelName,
    totalPoints
  };
};
