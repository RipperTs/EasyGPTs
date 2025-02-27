export enum SystemConfigsTypeEnum {
  fastgpt = 'fastgpt',
  fastgptPro = 'fastgptPro',
  systemMsgModal = 'systemMsgModal',
  ocrModel = 'ocrModel'
}

export const SystemConfigsTypeMap = {
  [SystemConfigsTypeEnum.fastgpt]: {
    label: 'fastgpt'
  },
  [SystemConfigsTypeEnum.fastgptPro]: {
    label: 'fastgptPro'
  },
  [SystemConfigsTypeEnum.systemMsgModal]: {
    label: 'systemMsgModal'
  },
  [SystemConfigsTypeEnum.ocrModel]: {
    label: 'ocrModel'
  }
};
