/**
 * 模型图标常量
 * 用于模型配置页面的图标选择
 */
export const MODEL_ICONS = [
  'baichuan.svg',
  'chatglm.svg',
  'claude.svg',
  'deepseek.svg',
  'ernie.svg',
  'gemini.svg',
  'huggingface.svg',
  'liantong.svg',
  'llm.svg',
  'meta.svg',
  'minimax.svg',
  'moonshot.svg',
  'meetup.svg',
  'meetupa.svg',
  'NVIDIA.svg',
  'ollama.svg',
  'openai.svg',
  'poe.svg',
  'qwen.svg',
  'siliconflow.svg',
  'sparkDesk.svg',
  'stability.svg',
  'websearch.svg',
  'xai.svg',
  'yi.svg'
] as const;

/**
 * 模型图标选项，包含label和value
 */
export const MODEL_ICON_OPTIONS = MODEL_ICONS.map((icon) => ({
  label: icon.replace('.svg', ''),
  value: `/imgs/model/${icon}`
}));

/**
 * 获取模型图标的完整路径
 */
export const getModelIconPath = (iconName: string): string => {
  if (iconName.startsWith('/imgs/model/')) {
    return iconName;
  }
  return `/imgs/model/${iconName}`;
};
