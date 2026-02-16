/**
 * Spider REST API client.
 *
 * Handles authenticated requests to api.spider.cloud with JSONL streaming
 * support for crawl/scrape endpoints and standard JSON for metadata endpoints.
 */

const API_BASE = "https://api.spider.cloud";
const MAX_CONTENT_LENGTH = 200_000;

export function getApiKey(): string {
  const key = process.env.SPIDER_API_KEY;
  if (!key) {
    throw new Error(
      "SPIDER_API_KEY environment variable is required. " +
        "Get your key at https://spider.cloud/api-keys"
    );
  }
  return key;
}

/**
 * Parse a JSONL stream into an array of objects.
 *
 * Handles UTF-8 multi-byte characters split across chunks, mixed \r\n and \n
 * line endings, empty lines, and malformed lines (silently skipped).
 */
async function parseJsonlStream(
  body: ReadableStream<Uint8Array>
): Promise<unknown[]> {
  const results: unknown[] = [];
  const decoder = new TextDecoder("utf-8");
  const reader = body.getReader();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        const remaining = buffer.trim();
        if (remaining.length > 0) {
          try {
            results.push(JSON.parse(remaining));
          } catch {
            // Partial write at stream end — discard
          }
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIdx).replace(/\r$/, "");
        buffer = buffer.slice(newlineIdx + 1);

        if (line.length === 0) continue;

        try {
          results.push(JSON.parse(line));
        } catch {
          // Malformed JSONL line — skip
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return results;
}

/**
 * Make an authenticated request to the Spider API.
 *
 * When `stream: true`, sends Content-Type: application/jsonl and parses the
 * response as a JSONL stream. Otherwise uses standard JSON.
 */
export async function apiRequest(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
  options?: { stream?: boolean }
): Promise<unknown> {
  const useJsonl = options?.stream ?? false;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${getApiKey()}`,
    "Content-Type": useJsonl ? "application/jsonl" : "application/json",
  };

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`Spider API error ${res.status}: ${text}`);
  }

  if (useJsonl && res.body) {
    return parseJsonlStream(res.body);
  }

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Format API response data as a string for MCP tool output.
 * Truncates at 200K characters to prevent context overflow.
 */
export function formatResult(data: unknown): string {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  if (text.length > MAX_CONTENT_LENGTH) {
    return (
      text.slice(0, MAX_CONTENT_LENGTH) +
      "\n\n[Response truncated at 200K characters. Use the `limit` parameter to reduce result size.]"
    );
  }
  return text;
}
