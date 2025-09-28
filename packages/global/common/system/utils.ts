export const delay = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(() => {
      resolve('');
    }, ms);
  });

export async function retryFn<T>(fn: () => Promise<T>, times = 3, sleepMs = 50): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < times; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < times - 1) await delay(sleepMs);
    }
  }
  throw lastErr;
}
