export interface GlobalOptions {
  apiKey: string;
  serverAddr: string;
  json?: true;
}

export let globalOpts: GlobalOptions | undefined = undefined;

export function setGlobalOptions(opts: GlobalOptions) {
  globalOpts = opts;
}

export function getGlobalOptions() {
  if (!globalOpts) {
    throw new Error("Global options are not initalized yet");
  }
  return globalOpts;
}
