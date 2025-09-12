import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
import { MongoSystemConfigs } from './schema';
import { FastGPTConfigFileType } from '@fastgpt/global/common/system/types';
import { FastGPTProUrl } from '../constants';

export const getFastGPTConfigFromDB = async () => {
  // 允许开源版也读取数据库配置
  try {
    const res = await MongoSystemConfigs.findOne({
      type: SystemConfigsTypeEnum.fastgpt
    }).sort({
      createTime: -1
    });

    const config = res?.value || {};

    return config as FastGPTConfigFileType;
  } catch (error) {
    console.warn('从数据库读取配置失败，将使用默认配置:', error);
    return {} as FastGPTConfigFileType;
  }
};
