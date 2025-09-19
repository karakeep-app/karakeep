// semaphore.test.ts

import { describe, expect, it } from "vitest";

import { AsyncSemaphore, limitConcurrency } from "./concurrency";

describe("AsyncSemaphore", () => {
  it("should acquire a permit if available", async () => {
    const semaphore = new AsyncSemaphore(1);
    await semaphore.acquire();
    expect(semaphore.available).toBe(0);
  });

  it("should wait if no permit is available", async () => {
    const semaphore = new AsyncSemaphore(1);
    await semaphore.acquire();

    let acquired = false;
    const acquirePromise = semaphore.acquire().then(() => {
      acquired = true;
    });

    expect(acquired).toBe(false); // Should not resolve right away
    semaphore.release();

    await acquirePromise; // wait for the resolution of the promise
    expect(acquired).toBe(true);
    expect(semaphore.available).toBe(0);
  });

  it("should release a permit", async () => {
    const semaphore = new AsyncSemaphore(1);
    await semaphore.acquire();
    expect(semaphore.available).toBe(0);
    semaphore.release();
    expect(semaphore.available).toBe(1);
  });

  it("should handle multiple acquires and releases", async () => {
    const semaphore = new AsyncSemaphore(2);
    await semaphore.acquire();
    await semaphore.acquire();
    expect(semaphore.available).toBe(0);

    let resolved1 = false;
    let resolved2 = false;
    const promise1 = semaphore.acquire().then(() => {
      resolved1 = true;
    });
    const promise2 = semaphore.acquire().then(() => {
      resolved2 = true;
    });

    expect(resolved1).toBe(false);
    expect(resolved2).toBe(false);

    semaphore.release();
    await promise1;
    expect(resolved1).toBe(true);
    expect(resolved2).toBe(false);

    semaphore.release();
    await promise2;
    expect(resolved2).toBe(true);
    expect(semaphore.available).toBe(0);
  });

  it("should acquire immediately if there is an available permit", async () => {
    const semaphore = new AsyncSemaphore(2);
    await semaphore.acquire();
    expect(semaphore.available).toBe(1);
    await semaphore.acquire();
    expect(semaphore.available).toBe(0);
  });
});

describe("limitConcurrency", () => {
  it("should execute all promises with concurrency limit", async () => {
    const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

    const promiseFunctions = [
      async () => {
        await delay(10);
        return 1;
      },
      async () => {
        await delay(5);
        return 2;
      },
      async () => {
        await delay(15);
        return 3;
      },
      async () => {
        await delay(10);
        return 4;
      },
    ];

    const concurrencyLimit = 2;
    const results = limitConcurrency(promiseFunctions, concurrencyLimit);
    expect(results).toHaveLength(promiseFunctions.length);

    const resolvedResults = await Promise.all(results);
    expect(resolvedResults).toEqual([1, 2, 3, 4]);
  });

  it("should limit concurrency", async () => {
    const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));
    let runningCount = 0;
    let maxCounter = 0;
    const promiseFunctions = [...Array(50).keys()].map(() => async () => {
      runningCount++;
      maxCounter = Math.max(maxCounter, runningCount);
      await delay(100);
      runningCount--;
    });
    const concurrencyLimit = 2;
    const results = limitConcurrency(promiseFunctions, concurrencyLimit);

    await Promise.all(results);
    expect(runningCount).toBe(0);
    expect(maxCounter).toBe(concurrencyLimit);
  });

  it("should handle errors in promise functions", async () => {
    const promiseFunctions = [
      async () => {
        return Promise.resolve(1);
      },
      async () => {
        return Promise.resolve(2);
      },
      async () => {
        return Promise.reject(new Error("Test Error"));
      },
      async () => {
        return Promise.resolve(4);
      },
    ];
    const concurrencyLimit = 2;

    const results = limitConcurrency(promiseFunctions, concurrencyLimit);

    await expect(Promise.all(results)).rejects.toThrow("Test Error"); // test that promise fails.

    const resolveResults = await Promise.allSettled(results); // check that the other promises resolve even if the function fails

    expect(resolveResults.map((r) => r.status)).toEqual([
      "fulfilled",
      "fulfilled",
      "rejected",
      "fulfilled",
    ]);
    expect(
      resolveResults[0].status === "fulfilled" && resolveResults[0].value,
    ).toBe(1);
    expect(
      resolveResults[1].status === "fulfilled" && resolveResults[1].value,
    ).toBe(2);
    expect(
      resolveResults[2].status === "rejected" &&
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        resolveResults[2].reason.message,
    ).toBe("Test Error");
    expect(
      resolveResults[3].status === "fulfilled" && resolveResults[3].value,
    ).toBe(4);
  });
});
