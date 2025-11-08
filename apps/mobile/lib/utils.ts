import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Merge props conditionally.
 *
 * @example
 * ```
 * <View {...condProps(
 *     { condition: true, props: { className: "foo" } },
 *     { condition: true, props: { style: { margin: "10px" } } },
 * )} />
 * ```
 * results in:
 * ```
 * <View className="foo" style={ margin: "10px" } />
 * ```
 * @example
 * ```
 * <View style={condProps(
 *     { condition: true, color: "red" },
 *     { condition: true, fontWeight: "bold" }
 * )} />
 * ```
 * results in:
 * ```
 * <View style={ color: "red", fontWeight: "bold" } />
 * ```
 */
export function condProps(
  ...condProps: {
    condition: boolean;
    props: Record<string, unknown>;
  }[]
): Record<string, unknown> {
  return condProps.reduce((acc, { condition, props }) => {
    return condition ? { ...acc, ...props } : acc;
  }, {});
}

/**
 * Build HTTP headers for API requests, merging Authorization and custom headers.
 * This ensures all direct HTTP calls (uploads, downloads, health checks) respect
 * the user's custom header configuration.
 */
export function buildApiHeaders(
  apiKey: string | undefined,
  customHeaders: Record<string, string> = {},
): Record<string, string> {
  return {
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    ...customHeaders,
  };
}
