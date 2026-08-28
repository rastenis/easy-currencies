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
}

/** Node's fetch reports the reason under `cause`; surface it as a code. */
function errorCode(err: any): string | undefined {
  if (err?.name === "TimeoutError" || err?.name === "AbortError") {
    return "ETIMEDOUT";
  }
  return err?.cause?.code ?? err?.code;
}

export function createClient(options: ClientOptions = {}): HttpClient {
  const timeout = options.timeout ?? 10000;

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
        data = await response.json();
      } catch {
        data = undefined;
      }

      if (!response.ok) {
        const error: HttpError = new Error(
          `Request failed with status code ${response.status}`
        );
        error.response = { status: response.status, data };
        throw error;
      }

      return { status: response.status, data };
    }
  };
}
