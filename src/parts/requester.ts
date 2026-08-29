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

/** Retry tuning. */
export interface RetryOptions {
  /** Retries after the initial request before giving up. Defaults to 2. */
  maxRetries?: number;
  /** Upper bound in ms on a wait before jitter. Defaults to 8000. */
  maxDelay?: number;
  /**
   * Wall-clock budget in ms for the whole conversion, spent across every
   * provider rather than reset for each one. Defaults to 20000.
   */
  budgetMs?: number;
  /**
   * Absolute epoch-ms deadline. Set by `getRates` from `budgetMs` so one budget
   * covers the whole chain; a direct `fetchRates` call may pass its own.
   */
  deadline?: number;
}

/** How a rate fetch failed. Every provider failure is recoverable by trying the next provider. */
export interface FetchRatesError {
  /** False means fatal: the caller rethrows rather than trying another provider. */
  handled: boolean;
  /** The reason, always an Error by the time it leaves here. */
  error: unknown;
}

// The old 5 retries capped at 16s ran 1+2+4+8+16 = 31s per provider, and the
// schedule restarted for each one: three rate-limited providers measured at
// 102s and 18 upstream requests, with no way for a caller to shorten it.
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_MAX_DELAY = 8000;
const DEFAULT_BUDGET = 20000;
const INITIAL_DELAY = 1000;
const JITTER = 1000;

/**
 * When a call that starts now must be finished by.
 *
 * `getRates` computes this once so a single budget covers the whole chain;
 * computing it per provider would let a three-provider chain spend three.
 */
export function deadlineFrom(options: RetryOptions): number {
  return Date.now() + normalize(options.budgetMs, DEFAULT_BUDGET);
}

/** Marks the rejection the budget raises, so it is not read as a transport failure. */
const BUDGET_EXHAUSTED = Symbol.for("easy-currencies.budgetExhausted");

function budgetExhausted(): Error {
  const error: any = new Error(
    "Request to the provider failed: the conversion ran out of time."
  );
  error[BUDGET_EXHAUSTED] = true;
  return error;
}

function isBudgetExhausted(value: unknown): boolean {
  return typeof value === "object" && value !== null && (value as any)[BUDGET_EXHAUSTED] === true;
}

/**
 * Rejects once the deadline passes.
 *
 * The 10s timeout lives inside the built-in client, so a caller-supplied one,
 * which `setClient` makes a headline feature, could leave `convert()` pending
 * for ever. Gating only the retry sleeps would not help: nothing fires while
 * the call itself is outstanding.
 */
function withDeadline<T>(work: Promise<T>, deadline: number): Promise<T> {
  const left = deadline - Date.now();
  if (left <= 0) {
    return Promise.reject(budgetExhausted());
  }

  return new Promise<T>((resolve, reject) => {
    // Deliberately not unref'd. This timer is the only thing keeping the loop
    // alive while a client hangs, which is precisely when the budget has to
    // fire; unref'ing it made node exit 0 with the promise never settling, so
    // the caller got neither a rate nor an error. It cannot outlive the answer
    // either way, because every settle path below clears it.
    const timer = setTimeout(() => reject(budgetExhausted()), left);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/** One attempt's place in the retry schedule. */
interface Schedule {
  attempt: number;
  maxRetries: number;
  delay: number;
  maxDelay: number;
  deadline: number;
}

/**
 * Waits out a 429 before the next attempt, or throws when there is no attempt
 * left to make and no time left to make it in.
 */
async function waitOutRateLimit(
  response: HttpResponse,
  { attempt, maxRetries, delay, maxDelay, deadline }: Schedule
): Promise<void> {
  if (attempt >= maxRetries) {
    // A rate limit says nothing about the provider's health.
    throw providerFailure(
      new Error(
        `Request to the provider failed: rate limited, giving up after ${
          attempt + 1
        } attempts (HTTP 429)`
      )
    );
  }

  // The server's own guidance beats our guess; ours is a fallback.
  const asked = retryAfter(response);
  const wait =
    asked === undefined
      ? Math.min(delay, maxDelay) + Math.random() * JITTER
      : Math.min(asked, maxDelay);

  // Sleeping past the deadline only to fail on waking is dead time, and it is
  // time the caller could have spent on the next provider.
  if (Date.now() + wait >= deadline) {
    throw providerFailure(budgetExhausted());
  }

  await sleep(wait);
}

/**
 * The failure a provider signalled, or null if it signalled none.
 *
 * Vendors split into two camps: apilayer-style ones put their code in a 200
 * body, the rest signal with an HTTP status. Only the body is readable in both
 * cases, so that is what the handler gets, and the status answers for the
 * providers whose errors table is keyed by it.
 *
 * Passing the response object to the handler instead meant `data.error.code`
 * read undefined on every HTTP failure, so the errors tables of
 * ExchangeRatesAPIIO, CurrencyLayer and Fixer were unreachable whenever the
 * vendor used a status: a 401 carrying {error:{code:101}} surfaced as
 * "HTTP 401" rather than "Invalid API key!".
 */
function signalledFailure(
  provider: Provider,
  failed: boolean,
  response: HttpResponse | undefined,
  result: HttpResponse | undefined
): FetchRatesError | null {
  // `?? {}` because the client sets data to undefined for an unparseable
  // response and handlers read fields off it without guards.
  const body = (failed ? response?.data : result?.data) ?? {};

  let error: number | string | null;
  try {
    error = provider.errorHandler(body);
  } catch (e) {
    throw providerFailure(
      e instanceof Error ? e : new Error(`Provider callback failed: ${String(e)}`)
    );
  }

  // Only a status the provider actually enumerates. An unmapped one is not a
  // verdict, and the caller phrases it as "HTTP 500" rather than surfacing a
  // bare number as the error.
  if (
    !error &&
    failed &&
    response &&
    Object.prototype.hasOwnProperty.call(provider.errors, response.status)
  ) {
    error = response.status;
  }

  if (!error) {
    return null;
  }

  // Own-property lookup: an errorHandler returning "constructor" would
  // otherwise find Object.prototype.constructor and read as a mapped error.
  const mapped = Object.prototype.hasOwnProperty.call(provider.errors, error)
    ? provider.errors[error]
    : undefined;

  // A code the provider does not enumerate is not a verdict on the chain.
  // Treating it as fatal meant a 500 from any provider whose errorHandler reads
  // the HTTP status ended the call outright, so the default chain never fell back.
  return mapped ? { handled: true, error: mapped } : { handled: true, error };
}

/**
 * The fetchRates function, used for fetching currency conversion rates.
 *
 * Rejects with a {@link FetchRatesError} in every failure mode.
 *
 * @export
 * @param {HttpClient} client - client to be used for the request
 * @param {Provider} provider - provider from which the quotes will be fetched
 * @param {Query} query - the query
 * @param {RetryOptions} [options] - retry tuning
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
  const deadline = options.deadline ?? deadlineFrom(options);

  let attempt = 0;
  let delay = INITIAL_DELAY; // initial delay in ms

  while (true) {
    let failed = false;
    let err: unknown;
    let result: HttpResponse | undefined;

    // Check before dispatching, not only around the wait: the argument to
    // withDeadline is evaluated first, so a spent budget would still fire a
    // request at a vendor whose answer could not be used.
    if (Date.now() >= deadline) {
      throw providerFailure(budgetExhausted());
    }

    // Not `_to`: a falsy rejection reason is indistinguishable from success,
    // and the old code then read `.data` off a null result.
    try {
      result = await withDeadline(client.get(formatUrl(provider, query)), deadline);
    } catch (e) {
      // The budget is not this provider's fault, but it is the whole call's
      // answer: trying the next one would only spend time it no longer has.
      if (isBudgetExhausted(e)) {
        throw providerFailure(e as Error);
      }
      failed = true;
      err = e;
    }

    const response = responseOf(err);

    if (failed && response?.status === 429) {
      await waitOutRateLimit(response, { attempt, maxRetries, delay, maxDelay, deadline });
      attempt++;
      delay *= 2;
      continue;
    }

    // A transport failure — DNS, refused, timeout, abort — carries no response
    // to inspect. Transient: the next call may well succeed.
    if (failed && !response) {
      throw providerFailure(transportError(err));
    }

    // A provider-signalled error ends this provider's turn.
    const signalled = signalledFailure(provider, failed, response, result);
    if (signalled) {
      throw signalled;
    }

    // An HTTP failure the provider does not recognise still failed. Falling
    // through here would read .data off an undefined result.
    if (failed) {
      throw providerFailure(transportError(err));
    }

    // A 200 whose body did not parse is not a usable response. Letting it
    // through made the provider's handler dereference undefined, and the
    // consumer's error was then a TypeError naming neither the provider nor the
    // cause, identical whether the socket died in 4ms or the read timed out.
    if (result!.data === undefined) {
      throw providerFailure(
        new Error("Provider returned a response with no readable body.")
      );
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

/** The rejection shape for a failure the caller should treat as this provider's, and fall back from. */
function providerFailure(error: Error): FetchRatesError {
  return { handled: true, error };
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
  // Replacer functions, not strings: `$&`, `` $` `` and `$'` are substitution
  // patterns, so a currency of "US$`D" would otherwise splice the URL prefix
  // into the middle of the URL. Encoding then stops a value escaping its slot —
  // "USD&access_key=x" adding a parameter, or "../.." traversing the path.
  const put = (value: string) => () => encodeURIComponent(value);

  // Global patterns, not string patterns: a template using a token twice would
  // otherwise ship the second one to the vendor literally. Kept as a regex
  // rather than replaceAll so the emit stays ES2015 for older bundlers.
  return (provider.endpoint.base + provider.endpoint.single)
    .replace(/%FROM%/g, put(query.FROM))
    .replace(/%TO%/g, put(query.TO))
    .replace(/%KEY%/g, put(provider.key || ""));
}
