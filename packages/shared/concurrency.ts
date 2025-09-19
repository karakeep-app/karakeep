export class AsyncSemaphore {
  private permits: number;
  private queue: (() => void)[] = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    } else {
      return new Promise<void>((resolve) => {
        this.queue.push(resolve);
      });
    }
  }

  release(): void {
    if (this.queue.length > 0) {
      const resolve = this.queue.shift();
      if (resolve) {
        resolve();
      }
    } else {
      this.permits++;
    }
  }

  get available(): number {
    return this.permits;
  }
}

export function limitConcurrency<T>(
  promises: (() => Promise<T>)[],
  concurrencyLimit: number,
): Promise<T>[] {
  const semaphore = new AsyncSemaphore(concurrencyLimit);
  const results: Promise<T>[] = [];

  for (const promiseFunction of promises) {
    results.push(
      semaphore
        .acquire()
        .then(() => {
          return promiseFunction();
        })
        .finally(() => {
          semaphore.release();
        }),
    );
  }
  return results;
}
