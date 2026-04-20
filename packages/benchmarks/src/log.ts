const ICONS = {
  step: "==",
  info: "--",
  success: "OK",
  warn: "!!",
};

export function logStep(title: string): void {
  console.log(`\n${ICONS.step} ${title}`);
}

export function logInfo(message: string): void {
  console.log(`  ${ICONS.info} ${message}`);
}

export function logSuccess(message: string): void {
  console.log(`  ${ICONS.success} ${message}`);
}

export function logWarn(message: string): void {
  console.log(`  ${ICONS.warn} ${message}`);
}
