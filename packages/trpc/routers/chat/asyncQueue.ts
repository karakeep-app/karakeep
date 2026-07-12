export interface AsyncQueue<T> extends AsyncIterableIterator<T> {
  push(value: T): void;
  close(): void;
}

export function createAsyncQueue<T>(): AsyncQueue<T> {
  const values: T[] = [];
  const waiters: ((result: IteratorResult<T>) => void)[] = [];
  let closed = false;

  return {
    push(value) {
      if (closed) {
        return;
      }

      const waiter = waiters.shift();
      if (waiter) {
        waiter({ done: false, value });
        return;
      }

      values.push(value);
    },
    close() {
      if (closed) {
        return;
      }

      closed = true;
      for (const waiter of waiters.splice(0)) {
        waiter({ done: true, value: undefined });
      }
    },
    next() {
      if (values.length > 0) {
        const value = values.shift()!;
        return Promise.resolve({ done: false, value });
      }

      if (closed) {
        return Promise.resolve({ done: true, value: undefined });
      }

      return new Promise((resolve) => {
        waiters.push(resolve);
      });
    },
    return() {
      this.close();
      return Promise.resolve({ done: true, value: undefined });
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}
