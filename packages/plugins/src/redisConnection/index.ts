import Redis from 'ioredis';

type Props = {
  action: string;
  host: string;
  port: number;
  db: number; // 数据库
  password?: string; // 密码,留空则不需要密码
  cacheKey: string;
  value?: string; // 当action为set时需要传入要缓存的值
  expirationTime: number; // 缓存时间单位秒,-1则永久缓存
};

type Response = Promise<{
  result: any;
}>;

// 判断字符串是否为JSON
const isJSON = (str: string): boolean => {
  try {
    JSON.parse(str);
    return true;
  } catch (e) {
    return false;
  }
};

const main = async ({
  action,
  host,
  port,
  db,
  cacheKey,
  value,
  password,
  expirationTime
}: Props): Response => {
  let result;

  try {
    // 创建Redis客户端实例
    const redis = new Redis({
      host,
      port,
      db,
      password: password || undefined
    });

    // 设置缓存
    if (action === 'set' && value !== undefined) {
      // 检查value是否为JSON字符串
      const valueToStore = isJSON(value) ? value : JSON.stringify(value);

      if (expirationTime !== -1) {
        // 设置带过期时间的缓存
        result = await redis.set(cacheKey, valueToStore, 'EX', expirationTime);
      } else {
        // 设置永久缓存
        result = await redis.set(cacheKey, valueToStore);
      }
    }

    // 读取缓存
    if (action === 'get') {
      const data = await redis.get(cacheKey);
      if (data) {
        try {
          // 尝试解析JSON
          result = JSON.parse(data);
        } catch (e) {
          // 如果解析失败,说明是普通字符串
          result = data;
        }
      } else {
        result = null;
      }
    }

    // 关闭连接
    await redis.quit();

    return {
      result
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('Redis operation error:', error.message);
      throw new Error(`Redis operation error: ${error.message}`);
    } else {
      console.error('Redis operation error:', error);
      throw new Error('Redis operation error: An unknown error occurred');
    }
  }
};

export default main;
