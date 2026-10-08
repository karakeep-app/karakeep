export interface ReadOnlyModeConfig {
  demoMode?: unknown;
  degradedMode: boolean;
}

export function getReadOnlyModeError(
  config: ReadOnlyModeConfig,
): string | null {
  if (config.demoMode) {
    return "Mutations are not allowed in demo mode";
  }
  if (config.degradedMode) {
    return "Karakeep is degraded and in read-only mode";
  }
  return null;
}
