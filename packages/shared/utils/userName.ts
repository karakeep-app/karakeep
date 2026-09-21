export function normalizeUserNameInput(input: string): string {
  return input.trim();
}

export function containsUnsafeUserNameMarkup(input: string): boolean {
  return /[<>]/.test(input);
}

export function resolveOAuthDisplayName(
  name: string | null | undefined,
  givenName: string | null | undefined,
  familyName: string | null | undefined,
): string | undefined {
  return (
    name?.trim() ||
    [givenName, familyName]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(" ") ||
    undefined
  );
}
