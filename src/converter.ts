import { fetchRates, deadlineFrom, RetryOptions } from "./parts/requester";
import { Provider, ProviderReference } from "./parts/providers";
import { Config } from "./parts/config";
export { Chainer as Convert } from "./parts/chainer";
import { _to } from "./parts/utils";
import { HttpClient } from "./parts/client";

/**
 * A simple map object for rates
 *
 * @export
 * @interface rateObject
 */
export interface rateObject {
  [currencyName: string]: number;
}

/**
 * Marks a rate map with the base currency it was fetched for.
 *
 * A symbol, so it never collides with a currency code and never appears in
 * Object.keys or JSON. Rates built by hand carry no marker and are accepted
 * as before.
 */
export const RATES_BASE = Symbol.for("easy-currencies.ratesBase");

/**
 * The enumerable twin of `RATES_BASE`.
 *
 * A symbol is invisible to `JSON.stringify`, spread, `Object.assign` and
 * `structuredClone`, so a table that has been through a cache loses the marker
 * and a conversion against the wrong base is then accepted silently. That is
 * the caching workflow this guard exists for, so the base also travels as an
 * ordinary key. Underscores are not valid in a currency code, see
 * `CURRENCY_CODE`, so this can never collide with a rate.
 */
export const RATES_BASE_KEY = "__base";

/**
 * An untrusted value as something with readable properties, or undefined.
 *
 * Vendor bodies and caller-supplied rate tables arrive as `unknown`. Reading a
 * property off one without narrowing first is how a malformed 200 used to
 * become a TypeError instead of a fallback.
 */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

/** The base a table was fetched for, or undefined for one built by hand. */
function baseOf(rates: unknown): string | undefined {
  const record = asRecord(rates);
  if (!record) {
    return undefined;
  }
  const marked =
    (record as Record<symbol | string, unknown>)[RATES_BASE] ??
    record[RATES_BASE_KEY];
  return typeof marked === "string" ? marked : undefined;
}

/**
 * How `fetchRates` describes a provider failure. `handled` marks it as coming
 * from the provider rather than from a bug, which is what makes it safe to move
 * on to the next one.
 */
interface ProviderFailure {
  handled: boolean;
  error: unknown;
}

/** A rejection that is not contract-shaped is a bug, not a provider failure, and must not trigger fallback. */
function isProviderFailure(value: unknown): value is ProviderFailure {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ProviderFailure).handled === "boolean"
  );
}

/**
 * Providers describe failures with strings and numeric codes; consumers write
 * `catch (e) { log(e.message) }`. Wrap so that reads something, keeping the
 * original on `cause`.
 */
function asError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }

  const message =
    typeof value === "string" && value.length > 0
      ? value
      : `Rate provider failed: ${String(value)}`;

  const error = new Error(message);
  (error as { cause?: unknown }).cause = value;
  return error;
}

/** Describes a rejected rate without dumping the whole object into the message. */
function describeRate(value: unknown): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (value === null || typeof value !== "object") {
    return String(value);
  }
  return Array.isArray(value) ? "an array" : "an object";
}

/** A currency library must never hand back NaN. */
function requireAmount(amount: unknown): number {
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    throw new Error(
      `Conversion amount must be a finite number, received ${describeRate(
        amount
      )}.`
    );
  }
  return amount;
}

/**
 * Asserts that a currency argument is a non-empty string.
 *
 * Without this, a missing currency reached the vendor as the literal
 * `undefined` and came back as a confusing "Currency not found".
 *
 * @param {unknown} currency - the value to check
 * @param {string} label - the parameter name, so the error says which is missing
 * @returns {string} - the validated currency
 */
/**
 * Every code the configured providers accept is alphanumeric: ISO 4217 is three
 * letters, and the crypto tickers they carry include `USDT`, `1INCH`, `0G` and
 * `00`, so neither "starts with a letter" nor "letters only" holds. AlphaVantage
 * publishes `SBDf`, so the check is case-insensitive.
 */
const CURRENCY_CODE = /^[A-Za-z0-9]{1,16}$/;

function requireCurrency(currency: unknown, label: string): string {
  if (typeof currency !== "string" || currency.trim().length === 0) {
    throw new Error(
      `The '${label}' currency must be a non-empty string, received ${describeRate(
        currency
      )}.`
    );
  }
  // Encoding alone does not close this: `.` is unreserved in RFC 3986, so
  // encodeURIComponent("..") is "..", and the URL parser then resolves the dot
  // segment and climbs the path. Rejecting the value is what actually stops it.
  if (!CURRENCY_CODE.test(currency)) {
    throw new Error(
      `The '${label}' currency must be alphanumeric, received ${describeRate(
        currency
      )}.`
    );
  }
  return currency;
}

/**
 * Lower-cases A-Z only.
 *
 * `String.prototype.toLowerCase` folds the Kelvin sign U+212A onto "k", so a
 * table carrying that key answered a request for "K". Currency codes are
 * ASCII, so the fold should be too.
 */
function asciiLower(value: string): string {
  return value.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
}

/**
 * A rate as a number, or NaN if the value is not one.
 *
 * FloatRates and AlphaVantage send rates as strings, so strings are accepted,
 * but only in decimal. `Number()` on its own also parses `0x`, `0b` and `0o`,
 * which turned a table carrying `"0x10"` into a rate of 16.
 */
const DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

function asRate(raw: unknown): number {
  if (typeof raw === "number") {
    return raw;
  }
  if (typeof raw === "string" && DECIMAL.test(raw.trim())) {
    return Number(raw);
  }
  return NaN;
}

/**
 * Whether a table holds at least one entry that will actually convert.
 *
 * Uses the same coercion as `convertRate`, so a table that passes here cannot
 * fail every lookup for want of a usable value.
 */
function hasUsableRate(rates: Record<string, unknown>): boolean {
  return Object.keys(rates).some((key) => {
    const value = asRate(rates[key]);
    return Number.isFinite(value) && value > 0;
  });
}

/**
 * Reads the rates out of a successful response.
 *
 * Returns the failure rather than throwing, so the caller can move to the next
 * provider: a vendor answering for a different base, or a handler that trips on
 * an unexpected shape, says nothing about the providers behind it.
 */
function readRates(
  provider: Provider,
  data: unknown,
  from: string
): [Error | null, rateObject] {
  // Some vendors truncate an unrecognised code to a valid prefix and answer for
  // that instead: exchangerate-api turns "CNYqqqwwC" into "CNY".
  const body = asRecord(data);
  const echoed = body?.base ?? body?.source;
  if (typeof echoed === "string" && echoed.toLowerCase() !== from.toLowerCase()) {
    return [
      new Error(
        `Provider answered for base '${echoed}', not the requested '${from}'.`
      ),
      {}
    ];
  }

  let handled: unknown;
  try {
    const handler = provider.handler as (body: unknown) => unknown;
    handled = handler(data);
  } catch (e) {
    return [asError(e), {}];
  }

  const rates = asRecord(handled);
  if (!rates) {
    return [new Error("Provider returned no usable rates."), {}];
  }

  // Three of the built-in handlers return {} by design when the body is not the
  // shape they expect, and FloatRates turns a junk 200 into {undefined: NaN}.
  // Treating that as a successful fetch of zero rates stops the chain with
  // healthy providers still behind it, and hands raw mode a garbage table.
  if (!hasUsableRate(rates)) {
    return [new Error("Provider returned a rate table with no usable rates."), {}];
  }

  // Stamp a copy, not the handler's own object. A handler may return a frozen
  // table, where writing throws, or a memoised one, where a later fetch for a
  // different base rewrites the marker under a caller still holding it.
  // The cast is the one place the base marker is smuggled into a table typed
  // as currency-to-number. RATES_BASE_KEY cannot be a currency code, so no
  // caller reading a rate can collide with it.
  const marked = { ...rates, [RATES_BASE_KEY]: from } as unknown as rateObject;
  Object.defineProperty(marked, RATES_BASE, {
    value: from,
    enumerable: false,
    configurable: true
  });

  return [null, marked];
}

/**
 * Regular converter class definition.
 *
 * @export
 * @class Converter
 */
export class Converter {
  /**
   * Converter's main config object.
   *
   * @type {Config}
   * @memberof Converter
   */
  config: Config;

  /**
   * Called with each handled provider error before the next provider is tried.
   *
   * A library does not own the consumer's stderr, so this is the single point
   * where that reporting happens. It defaults to the previous behaviour;
   * assign your own to route the errors elsewhere, or assign a no-op to
   * silence them entirely.
   *
   * @example
   * const converter = new Converter();
   * converter.onError = () => {};                 // silence
   * converter.onError = (e) => logger.warn(e);    // or route
   *
   * @memberof Converter
   */
  onError: (error: unknown) => void = (error: unknown) => {
    console.error(error);
  };

  /**
   * Reports a provider failure without letting the report become the failure.
   *
   * `onError` is consumer code, and the default is `console.error`, which
   * throws on a closed stdout: a CLI piped into `head` would abort the whole
   * chain on EPIPE and never reach the healthy provider behind it.
   */
  private report(error: unknown): void {
    try {
      this.onError(error);
    } catch {
      /* a broken reporter is not a reason to abandon the conversion */
    }
  }

  /**
   * Creates an instance of Converter.
   * @param {(...ProviderReference[] | undefined[] | string[])} config
   * @memberof Converter
   */
  constructor(...config: ProviderReference[] | undefined[] | string[]) {
    this.config = new Config(...config);

    this.add = this.config.add;
    this.addMultiple = this.config.addMultiple;

    this.remove = this.config.remove;
  }

  /**
   * Getters for active providers
   *
   * @readonly
   * @type {Provider[]}
   * @memberof Converter
   */
  get providers(): Provider[] {
    // A copy: the readme tells callers to read this, and handing back the live
    // array lets `providers.length = 0` empty the chain.
    return [...this.config.providers];
  }
  get active(): Provider[] {
    return [...this.config.providers];
  }

  /*
   Proxy function definitions
   */
  add: Config["add"];
  addMultiple: Config["addMultiple"];
  remove: Config["remove"];

  /**
   * Replaces the HTTP client.
   *
   * The default client uses the global fetch, which has no proxy option, so
   * proxying (or a custom agent, or instrumentation) means supplying your own.
   *
   * @example
   * import { ProxyAgent } from "undici";
   * const dispatcher = new ProxyAgent("http://proxy:8080");
   * converter.setClient({
   *   get: (url) =>
   *     fetch(url, { dispatcher } as any).then(async (r) => ({
   *       status: r.status,
   *       data: await r.json()
   *     }))
   * });
   *
   * @param {HttpClient} client - the client to use
   */
  setClient = (client: HttpClient) => {
    this.config.setClient(client);
  };

  /**
   * Tunes retries and the time a conversion may take.
   *
   * `budgetMs` is wall clock for the whole call, spent across every provider
   * rather than reset for each one, and it covers the requests themselves: a
   * client that never settles cannot hold a conversion open past it. Fields
   * merge, so one can be set without restating the rest.
   *
   * @example
   * converter.setRetryOptions({ budgetMs: 5000 });   // an HTTP handler
   * converter.setRetryOptions({ maxRetries: 0 });    // never retry a 429
   *
   * @param {RetryOptions} options - the tuning to apply
   */
  setRetryOptions = (options: RetryOptions) => {
    this.config.setRetryOptions(options);
  };

  /**
   * Conversion function (non chainable).
   *
   * @example
   * const converter = new Converter()
   * const converted = await converter.convert(15,"USD","EUR")
   * console.log(converted);
   *
   * @param {number} amount - amount to be converted
   * @param {string} from - base currency
   * @param {string} to - conversion currency
   * @param {any} rates - conversion rates, if they were pre-fetched
   * @throws {Error} - if the amount is not finite, or a currency is missing
   * @returns {Promise<number>} - converted amount
   */
  convert = async (
    amount: number,
    from: string,
    to: string,
    // Public signature, and `any` is load-bearing here rather than laziness.
    // Rates may legitimately arrive with string values, which FloatRates and
    // AlphaVantage really send, and a caller's own interface has no index
    // signature so it would not satisfy Record<string, unknown>. Narrowing
    // happens immediately below instead.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rates: any = undefined
  ): Promise<number> => {
    // Validating before anything is requested: an unset amount used to come
    // back as NaN, and an unset currency reached the vendor as "undefined".
    requireAmount(amount);
    requireCurrency(from, "from");
    requireCurrency(to, "to");

    // Returining conversion from provided rates
    if (rates !== undefined && rates !== null) {
      const base = baseOf(rates);
      if (
        base !== undefined &&
        typeof from === "string" &&
        base.toLowerCase() !== from.toLowerCase()
      ) {
        throw new Error(
          `Rates were fetched for base '${base}', but conversion asked for '${from}'.`
        );
      }
      return this.convertRate(amount, to, rates);
    }

    //Fetching conversion rates from the active provider
    const [err, data] = await _to(this.getRates(from, to, false));

    if (err) {
      throw asError(err);
    }

    if (!data || Object.keys(data).length == 0) {
      throw new Error("No data returned for rate fetch.");
    }

    // Normalizing resulting rates data
    return this.convertRate(amount, to, data);
  };

  /**
   * Performs safe multiplication to get the result amount.
   *
   * A usable rate is finite and greater than zero; anything else multiplies
   * into a plausible-looking wrong amount.
   *
   * @param {number} amount - amount to be converted
   * @param {string} to - conversion currency
   * @param {any} rates - conversion rates, if they were pre-fetched
   * @throws {Error} - if the amount, the currency, the rates or the rate is invalid
   * @returns {number} - converted amount
   */
  convertRate = (
    amount: number,
    to: string,
    // Public signature, and `any` is load-bearing here rather than laziness.
    // Rates may legitimately arrive with string values, which FloatRates and
    // AlphaVantage really send, and a caller's own interface has no index
    // signature so it would not satisfy Record<string, unknown>. Narrowing
    // happens immediately below instead.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rates: any = undefined
  ): number => {
    requireAmount(amount);
    requireCurrency(to, "to");

    // Array.isArray as well as the record check: an array IS an object, and
    // Object.keys([0.9]) is ["0"], so a table read from an array offered
    // index-keyed currencies rather than being rejected.
    const table = Array.isArray(rates) ? undefined : asRecord(rates);
    if (!table) {
      throw new Error(
        `Rates must be an object mapping currency to rate, received ${describeRate(
          rates
        )}.`
      );
    }

    // The base marker rides along as an ordinary key; it is not a rate, so it
    // is neither a lookup candidate nor part of the "N rates available" count.
    const keys = Object.keys(table).filter((key) => key !== RATES_BASE_KEY);
    // Exact match wins, so a response carrying both "EUR" and "eur" does not
    // resolve differently depending on JSON key order.
    const rateKey =
      keys.find((key) => key === to) ??
      keys.find((key) => asciiLower(key) === asciiLower(to));

    // Truthiness would report a present-but-zero rate as missing.
    if (rateKey === undefined) {
      // The full table is ~4KB in production.
      throw new Error(
        `No '${to}' present in rates (${keys.length} rate${
          keys.length === 1 ? "" : "s"
        } available).`
      );
    }

    const raw = table[rateKey];
    const numericRate = asRate(raw);

    if (!Number.isFinite(numericRate) || numericRate <= 0) {
      throw new Error(
        `Invalid rate value for '${to}': expected a finite number greater than zero, received ${describeRate(
          raw
        )}.`
      );
    }

    const converted = amount * numericRate;

    // Both operands are already finite and the rate is positive, so a result
    // that is not finite overflowed and a result of zero from a non-zero amount
    // underflowed. Either way the product is not the answer, and returning it
    // hands back a wrong number that looks like a right one.
    if (!Number.isFinite(converted) || (converted === 0 && amount !== 0)) {
      throw new Error(
        `Converting ${amount} at rate ${numericRate} is not representable as a number.`
      );
    }

    return converted;
  };

  /**
   * Rate fetch function.
   *
   * Walks a snapshot of the chain, so concurrent calls do not shrink each
   * other's list. A failure applies to the call, not the chain: no provider is
   * removed, so one unknown currency cannot degrade a long-lived converter.
   *
   * @param {string} from - base currency
   * @param {string} to - conversion currency
   * @param {boolean} multiple - determines conversion mode
   * @throws {Error} - if a currency is missing, or every provider failed
   * @returns {Promise<rateObject>} - the fetched rates
   */
  getRates = async (
    from: string,
    to: string,
    multiple: boolean = false
  ): Promise<rateObject> => {
    requireCurrency(from, "from");

    // In multiple mode the whole table is fetched for the base currency, so
    // there is no target currency to validate.
    if (!multiple) {
      requireCurrency(to, "to");
    }

    // Per-call snapshot of the fallback chain.
    const chain = [...this.config.providers];

    if (chain.length === 0) {
      throw new Error("No rate providers are configured.");
    }

    // Getting the client
    const client = this.config.getClient();

    // One deadline for the whole chain. Per provider it would let a
    // three-provider chain spend three budgets, which is how a rate-limited
    // conversion reached 102 seconds.
    const retry = this.config.getRetryOptions();
    const deadline = deadlineFrom(retry);

    let lastError: Error = new Error("No rate providers were tried.");

    for (let index = 0; index < chain.length; index++) {
      const provider = chain[index];

      // A whole-table fetch has no target currency, so a provider whose template
      // needs one cannot serve it: the request would go out asking for an empty
      // symbol list. That is this provider's limitation, so move to the next.
      if (multiple && provider.endpoint.single.includes("%TO%")) {
        lastError = new Error(
          "Provider cannot fetch a whole rate table; it requires a target currency."
        );
        this.report(lastError);
        continue;
      }

      // The rejection is a FetchRatesError, not an Error, so name both sides
      // rather than casting the pair to any and losing the shape entirely.
      const [err, data] = await _to<unknown, unknown>(
        fetchRates(
          client,
          provider,
          { FROM: from, TO: to, multiple: multiple },
          { ...retry, deadline }
        )
      );

      if (!err) {
        // A provider answering wrongly, or a handler throwing on a shape it did
        // not expect, is that provider's failure. Aborting here would give up on
        // the healthy providers behind it.
        const [failure, rates] = readRates(provider, data, from);
        if (!failure) {
          return rates;
        }
        this.report(failure);
        lastError = failure;
        continue;
      }

      // A rejection that does not follow the failure contract was not
      // classified by the requester, so there is nothing to fall back for.
      if (!isProviderFailure(err) || !err.handled) {
        throw asError(isProviderFailure(err) ? err.error : err);
      }

      this.report(err.error);
      lastError = asError(err.error);
    }

    // Every provider in the snapshot failed.
    throw lastError;
  };
}
