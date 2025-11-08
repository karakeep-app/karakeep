export async function waitUntil(
  f: () => Promise<boolean>,
  description: string,
  timeoutMs = 60000,
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    console.log(`Waiting for ${description}...`);
    try {
      const res = await f();
      if (res) {
        console.log(`${description}: success`);
        return;
      }
    } catch (error) {
      console.log(`${description}: error, retrying...: ${error}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`${description}: timeout after ${timeoutMs}ms`);
}
