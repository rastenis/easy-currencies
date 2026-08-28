import { HttpClient, HttpError, HttpResponse } from "./client";
import { Provider } from "./providers";
import { sleep } from "../parts/utils"

/**
 * Query interface, used to interact with the requester.
 *
 * @export
 * @interface Query
 */
export interface Query {
  FROM: string;
  TO: string;
  multiple: boolean;
}

/** Retry tuning. Defaults preserve the 1.x schedule. */
export interface RetryOptions {
  /** Retries after the initial request before giving up. Defaults to 5. */
  maxRetries?: number;
  /** Upper bound in ms on a wait before jitter. Defaults to 16000. */
  maxDelay?: number;
}

/**
 * How a rate fetch failed. `handled` says whether the caller may fall back;
 * `transient` says whether the provider keeps its place. A blip is not a reason
 * to drop a provider for the process's life; an invalid key is.
 */
export interface FetchRatesError {
  /** False means fatal: the caller rethrows rather than trying another provider. */
  handled: boolean;
  /** True means try the next provider, but keep this one for later calls. */
  transient?: boolean;
  error: unknown;
}

const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_MAX_DELAY = 16000;
const INITIAL_DELAY = 1000;
const JITTER = 1000;

/**
 * The fetchRates function, used for fetching currency conversion rates.
 *
 * Rejects with a {@link FetchRatesError} in every failure mode.
 *
 * @export
 * @param {HttpClient} client - client to be used for the request
 * @param {Provider} provider - provider from which the quotes will be fetched
 * @param {Query} query - the query
 * @param {RetryOptions} [options] - retry tuning; defaults preserve prior behaviour
 * @returns {Promise<any>} - a result promise
 */
export async function fetchRates(
  client: HttpClient,
  provider: Provider,
  query: Query,
  options: RetryOptions = {}
): Promise<any> {
  const maxRetries = normalize(options.maxRetries, DEFAULT_MAX_RETRIES);
  const maxDelay = normalize(options.maxDelay, DEFAULT_MAX_DELAY);

  let attempt = 0;
  let delay = INITIAL_DELAY; // initial delay in ms

  while (true) {
    let failed = false;
    let err: unknown;
    let result: HttpResponse | undefined;

    // Not `_to`: a falsy rejection reason is indistinguishable from success,
    // and the old code then read `.data` off a null result.
    try {
      result = await client.get(formatUrl(provider, query));
    } catch (e) {
      failed = true;
      err = e;
    }

    const response = responseOf(err);

    if (failed && response?.status === 429) {
      if (attempt >= maxRetries) {
        // A rate limit says nothing about the provider's health.
        throw transient(
          new Error(
            `Request to the provider failed: rate limited, giving up after ${
              attempt + 1
            } attempts (HTTP 429)`
          )
        );
      }

      // The server's own guidance beats our guess; ours is a fallback.
      const asked = retryAfter(response);
      await sleep(
        asked === undefined
          ? Math.min(delay, maxDelay) + Math.random() * JITTER
          : Math.min(asked, maxDelay)
      );

      attempt++;
      delay *= 2;
      continue;
    }

    // A transport failure — DNS, refused, timeout, abort — carries no response
    // to inspect. Transient: the next call may well succeed.
    if (failed && !response) {
      throw transient(transportError(err));
    }

    // resolving error
    const error = provider.errorHandler(
      failed ? response : (result as HttpResponse).data
    );

    // returning either the meaning of the error (if registered in provider's definition), or the error itself.
    if (error) {
      // A mapped error is a verdict on the provider itself (bad key, plan too
      // small), so it is deliberately not transient: the caller may drop it.
      // One the provider does not recognise is not ours to interpret at all.
      const failure: FetchRatesError = provider.errors[error]
        ? { handled: true, error: provider.errors[error] }
        : { handled: false, error };
      throw failure;
    }

    // An HTTP failure the provider does not recognise still failed. Falling
    // through here would read .data off an undefined result.
    if (failed) {
      throw transient(transportError(err));
    }

    return (result as HttpResponse).data;
  }
}

/** A positive, finite override; anything else falls back to the default. */
function normalize(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

/** The rejection shape for a failure that should not cost the provider its place. */
function transient(error: Error): FetchRatesError {
  return { handled: true, transient: true, error };
}

/** The response of an HTTP failure, or undefined for anything else thrown. */
function responseOf(err: unknown): HttpResponse | undefined {
  return err && typeof err === "object"
    ? (err as HttpError).response
    : undefined;
}

/**
 * Reads a header off a response, tolerating both a plain object map and a
 * fetch-style Headers instance.
 *
 * `HttpResponse` carries no headers today, so this only pays off for a custom
 * client that attaches them — but it costs nothing to look.
 */
function header(response: HttpResponse, name: string): string | undefined {
  const headers = (response as any).headers;
  if (!headers) {
    return undefined;
  }

  if (typeof headers.get === "function") {
    const value = headers.get(name);
    return typeof value === "string" ? value : undefined;
  }

  const wanted = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === wanted) {
      const value = headers[key];
      return typeof value === "string" || typeof value === "number"
        ? String(value)
        : undefined;
    }
  }
  return undefined;
}

/**
 * Retry-After as milliseconds to wait, or undefined when absent or unusable.
 *
 * The header is either a count of seconds or an HTTP date. Digits are tested
 * first: Date.parse("2") happily reads a bare number as a year.
 */
function retryAfter(response: HttpResponse): number | undefined {
  const raw = header(response, "retry-after");
  if (raw === undefined) {
    return undefined;
  }

  const value = raw.trim();
  if (/^\d+$/.test(value)) {
    return Number(value) * 1000;
  }

  const at = Date.parse(value);
  if (Number.isNaN(at)) {
    return undefined;
  }

  // A date already in the past means "retry now", not "retry in the past".
  return Math.max(at - Date.now(), 0);
}

/**
 * Describes a thrown value in one line, without serialising it.
 *
 * Clients are free to reject with anything at all, and `err.code ||
 * err.message || String(err)` reads "undefined" off half of them. Unknown
 * objects are named, never stringified: their fields can hold the request URL.
 *
 * @param {unknown} err - the thrown value
 * @returns {string} - a short, safe description
 */
function describe(err: unknown): string {
  if (typeof err === "string") {
    return err.trim() || "unknown error";
  }

  if (err && typeof err === "object") {
    const { code, message } = err as HttpError;
    if (typeof code === "string" && code.trim()) {
      return code.trim();
    }
    if (typeof code === "number") {
      return String(code);
    }
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
    // Named, not dumped — an error object's own fields may carry the API key.
    const name = (err as any).constructor?.name;
    return typeof name === "string" && name && name !== "Object"
      ? `${name} (no message)`
      : "unknown error";
  }

  if (err === null || err === undefined) {
    return "unknown error";
  }

  // Whatever is left is a primitive — number, bigint, boolean, symbol — and
  // every one of those renders. Objects never reach here, which matters:
  // String() throws on a null prototype, and their fields are not ours to show.
  return String(err);
}

/**
 * Reduces a request error to a message and code.
 *
 * The underlying error can carry the request URL, which embeds the provider API
 * key. Callers log these errors, so returning the original would write
 * credentials to the consumer's logs.
 *
 * @param {unknown} err - the request error
 * @returns {Error} - an error safe to log
 */
function transportError(err: unknown): Error {
  const status = responseOf(err)?.status;
  const detail = status ? `HTTP ${status}` : describe(err);
  const error = new Error(`Request to the provider failed: ${detail}`);

  const code = (err as HttpError)?.code;
  if (typeof code === "string") {
    (error as any).code = code;
  }
  return error;
}

/**
 * URL formatting function
 *
 * @param {Provider} provider - provider against which the request will be executed
 * @param {Query} query - the query
 * @returns {string} - formatted GET url string.
 */
function formatUrl(provider: Provider, query: Query): string {
  // if (query.multiple) {
  //   return (provider.endpoint.base + provider.endpoint.multiple)
  //     .replace("%FROM%", query.FROM)
  //     .replace("%KEY%", provider.key || "");
  // }

  // inserting base currency, final currency, and key (if needed)
  return (provider.endpoint.base + provider.endpoint.single)
    .replace("%FROM%", query.FROM)
    .replace("%TO%", query.TO)
    .replace("%KEY%", provider.key || "");
}
