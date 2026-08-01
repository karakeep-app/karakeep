export async function getResponseError(response: Response): Promise<string> {
  let detail: string | undefined;

  try {
    const body = await response.text();
    if (body) {
      try {
        const parsed = JSON.parse(body) as {
          error?: unknown;
          message?: unknown;
        };
        const message = parsed.message ?? parsed.error;
        detail = typeof message === "string" ? message : body;
      } catch {
        detail = body;
      }
    }
  } catch {
    // The status still provides a useful error if the response body is unreadable.
  }

  const status = `HTTP ${response.status} ${response.statusText}`.trim();
  return detail ? `${status}: ${detail}` : status;
}
