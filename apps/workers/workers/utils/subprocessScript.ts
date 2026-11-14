// Resolves how to launch one of the standalone scripts in `apps/workers/scripts`
// as a separate node process with a bounded heap.

function getScriptPath(scriptName: string): string {
  const currentUrl = import.meta.url;
  if (currentUrl.includes("/dist/")) {
    // Production: running from built output
    return new URL(`./scripts/${scriptName}.js`, currentUrl).pathname;
  }
  // Dev mode: running via tsx
  return new URL(`../../scripts/${scriptName}.ts`, currentUrl).pathname;
}

export function getScriptCommand(
  scriptName: string,
  maxOldSpaceSizeMb: number,
): { cmd: string; args: string[] } {
  const scriptPath = getScriptPath(scriptName);
  const args = [`--max-old-space-size=${maxOldSpaceSizeMb}`, scriptPath];

  if (scriptPath.endsWith(".ts")) {
    // Dev mode: use tsx to run TypeScript directly
    return { cmd: "tsx", args };
  }

  return { cmd: process.execPath, args };
}
