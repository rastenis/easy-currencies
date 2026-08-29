/**
 * Minimal HTTP client built on the global fetch, so the library ships with no
 * runtime dependencies.
 *
 * Callers who need a proxy, custom agent, retries or instrumentation implement
 * HttpClient themselves and pass it to Converter#setClient. Node's fetch has no
 * proxy option, so proxy support means bringing your own dispatcher:
 *
 *   import { ProxyAgent } from "undici";
 *   const dispatcher = new ProxyAgent("http://proxy:8080");
 *   converter.setClient({
 *     get: (url) => fetch(url, { dispatcher }).then(async (r) => ({
 *       status: r.status,
 *       data: await r.json()
 *     }))
 *   });
 */

export interface HttpResponse {
  status: number;
  data: any;
  /** Lower-cased response header names. Needed for Retry-After on a 429. */
  headers?: Record<string, string>;
}

/**
 * A rejection carrying a response is an HTTP failure; one without is a
 * transport failure. Providers' errorHandlers rely on that distinction.
 */
export interface HttpError extends Error {
  response?: HttpResponse;
  code?: string;
}

export interface HttpClient {
  get(url: string): Promise<HttpResponse>;
}

export interface ClientOptions {
  /** Milliseconds before a request is aborted. Defaults to 10000. */
  timeout?: number;
  /**
   * Bytes of response body the client will buffer before giving up. Defaults
   * to 10MB. An unterminated stream otherwise buffers whole until the timeout
   * fires, so this is what stands between a broken upstream and an OOM; the
   * largest real rate table is ~4KB, so 10MB is pure headroom, not a real ceiling.
   */
  maxResponseSize?: number;
}

const DEFAULT_MAX_RESPONSE_SIZE = 10 * 1024 * 1024;

/** Node's fetch reports the reason under `cause`; surface it as a code. */
function errorCode(err: any): string | undefined {
  if (err?.name === "TimeoutError" || err?.name === "AbortError") {
    return "ETIMEDOUT";
  }
  return err?.cause?.code ?? err?.code;
}

/** Distinguishes a body that grew past the cap from any other parse failure. */
class ResponseTooLargeError extends Error {}

/**
 * Reads the body up to `limit` bytes and parses it as JSON.
 *
 * Reading via the stream instead of response.json() is what lets a call bail
 * out mid-download: an unterminated chunked stream measured at 8898MB pushed
 * and 9078MB RSS before the 10s abort ever landed, since response.json()
 * buffers the whole thing first. TextDecoder, not Buffer#toString, so a
 * leading UTF-8 BOM is stripped the same way response.json() strips it.
 */
async function readBody(response: Response, limit: number): Promise<any> {
  if (!response.body) {
    return undefined;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new ResponseTooLargeError(`Response body exceeded ${limit} bytes`);
    }
    chunks.push(value);
  }

  const text = new TextDecoder().decode(concat(chunks, total));
  return JSON.parse(text);
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export function createClient(options: ClientOptions = {}): HttpClient {
  const timeout = options.timeout ?? 10000;
  const maxResponseSize = options.maxResponseSize ?? DEFAULT_MAX_RESPONSE_SIZE;

  return {
    async get(url: string): Promise<HttpResponse> {
      let response: Response;
      try {
        response = await fetch(url, { signal: AbortSignal.timeout(timeout) });
      } catch (err: any) {
        // No response: DNS, refused, timeout, abort.
        const error: HttpError = new Error(err?.message || "fetch failed");
        error.code = errorCode(err);
        throw error;
      }

      // A provider may signal failure in a 200 body, so parse before branching.
      // Vendors occasionally return HTML on an outage; treat that as no body
      // rather than failing here.
      let data: any;
      try {
        data = await readBody(response, maxResponseSize);
      } catch (err) {
        if (err instanceof ResponseTooLargeError) {
          // Same shape as the transport failure above: no usable response
          // came back, so the fallback chain has to treat this provider the
          // same way it treats a dropped connection, not a parsed answer.
          //
          // Carried on `code`, not in the message. The requester will not echo
          // a client's message, because that is where a URL and its API key
          // end up, so a message-only failure surfaces as "Error (message
          // withheld)" and says nothing about what went wrong.
          const tooLarge: any = new Error(err.message);
          tooLarge.code = "E_RESPONSE_TOO_LARGE";
          throw tooLarge;
        }
        data = undefined;
      }

      const headers: Record<string, string> = {};
      response.headers.forEach((value, name) => {
        headers[name.toLowerCase()] = value;
      });

      if (!response.ok) {
        const error: HttpError = new Error(
          `Request failed with status code ${response.status}`
        );
        error.response = { status: response.status, data, headers };
        throw error;
      }

      return { status: response.status, data, headers };
    }
  };
}
