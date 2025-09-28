export function switchCase<T extends string | number, R>(
  value: T,
  cases: Record<T, R>,
) {
  return cases[value];
}
