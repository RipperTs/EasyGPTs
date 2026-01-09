import { connectionMongo, ClientSession } from './index';

const timeout = 60000;

export const mongoSessionRun = async <T = unknown>(fn: (session: ClientSession) => Promise<T>) => {
  const session = await connectionMongo.startSession();

  try {
    let result: T | undefined;

    await session.withTransaction(
      async () => {
        result = await fn(session);
      },
      {
        maxCommitTimeMS: timeout
      }
    );

    return result as T;
  } catch (error) {
    return Promise.reject(error);
  } finally {
    await session.endSession();
  }
};
