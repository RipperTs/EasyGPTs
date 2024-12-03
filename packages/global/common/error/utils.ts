import { replaceSensitiveText } from '../string/tools';

export const getErrText = (err: any, def = ''): any => {
  const msg: string =
    typeof err === 'string'
      ? err
      : err?.response?.data?.message || err?.response?.message || err?.message || def;
  msg && console.log('error =>', msg);
  // todo: 添加一个异常响应的日志和报警通知
  return replaceSensitiveText(msg);
};
