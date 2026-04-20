export function normalizeUserNameInput(input: string): string {
  return input.trim();
}

export function containsUnsafeUserNameMarkup(input: string): boolean {
  return /[<>]/.test(input);
}
