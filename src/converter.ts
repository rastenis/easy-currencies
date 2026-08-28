import { fetchRates } from "./parts/requester";
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
 * The rejection shape `fetchRates` uses to describe a provider failure.
 *
 * `handled: false` means the requester did not recognise the failure, so there
 * is nothing to fall back for. `transient` distinguishes a blip (try the next
 * provider for this call, keep this one) from a permanent fault such as a bad
 * API key (try the next provider, and drop this one from the active list).
 * A missing `transient` is read as `false`.
 */
interface ProviderFailure {
  handled: boolean;
  transient?: boolean;
  error: unknown;
}

/**
 * Reports whether a rejection follows the requester's failure contract.
 *
 * Anything else — a bare Error, a TypeError thrown inside the requester — is
 * not a classified provider failure and must not trigger fallback.
 */
function isProviderFailure(value: unknown): value is ProviderFailure {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ProviderFailure).handled === "boolean"
  );
}

/**
 * Normalizes a thrown value into a real Error.
 *
 * Providers describe their failures with plain strings and numeric codes, and
 * consumers write `catch (e) { log(e.message) }`. Throwing the raw value gives
 * them `undefined` and breaks `instanceof Error`, so everything leaving this
 * module is wrapped, with the original preserved on `cause`.
 *
 * @param {unknown} value - the thrown value
 * @returns {Error} - the value itself if it is already an Error, else a wrapper
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
  (error as any).cause = value;
  return error;
}

/**
 * Renders a rejected rate for an error message without dumping a whole object.
 *
 * @param {unknown} value - the offending value
 * @returns {string} - a short, safe description
 */
function describeRate(value: unknown): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (value === null || typeof value !== "object") {
    return String(value);
  }
  return Array.isArray(value) ? "an array" : "an object";
}

/**
 * Asserts that an amount is a real, finite number.
 *
 * A currency library must never hand back `NaN`, and the old code did exactly
 * that for an unset or non-numeric amount.
 *
 * @param {unknown} amount - the value to check
 * @returns {number} - the validated amount
 */
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
function requireCurrency(currency: unknown, label: string): string {
  if (typeof currency !== "string" || currency.trim().length === 0) {
    throw new Error(
      `The '${label}' currency must be a non-empty string, received ${describeRate(
        currency
      )}.`
    );
  }
  return currency;
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
   * Creates an instance of Converter.
   * @param {(...ProviderReference[] | undefined[] | string[])} config
   * @memberof Converter
   */
  constructor(...config: ProviderReference[] | undefined[] | string[]) {
    this.config = new Config(...config);

    // Forwarding config adder function (with the alternative handle)
    this.add = this.config.add;
    this.addProvider = this.config.add;

    // Forwarding config multiple adder function (with the alternative handle)
    this.addMultiple = this.config.addMultiple;
    this.addMultipleProviders = this.config.addMultiple;

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
    return this.config.providers;
  }
  get active(): Provider[] {
    return this.config.providers;
  }

  /*
   Proxy function definitions
   */
  add: Config["add"];
  addProvider: Config["add"];
  addMultiple: Config["addMultiple"];
  addMultipleProviders: Config["addMultiple"];
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
    rates: any = undefined
  ): Promise<number> => {
    // Validating before anything is requested: an unset amount used to come
    // back as NaN, and an unset currency reached the vendor as "undefined".
    requireAmount(amount);
    requireCurrency(from, "from");
    requireCurrency(to, "to");

    // Returining conversion from provided rates
    if (typeof rates !== "undefined") {
      const base = rates[RATES_BASE];
      if (
        typeof base === "string" &&
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
   * A usable rate is a finite number strictly greater than zero. Anything else
   * — a zero, a negative, `Infinity`, a string with trailing garbage, an array
   * that happens to coerce — is rejected rather than silently multiplied,
   * since each of those produces a plausible-looking wrong amount.
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
    rates: any = undefined
  ): number => {
    requireAmount(amount);
    requireCurrency(to, "to");

    if (typeof rates !== "object" || rates === null) {
      throw new Error(
        `Rates must be an object mapping currency to rate, received ${describeRate(
          rates
        )}.`
      );
    }

    const keys = Object.keys(rates);
    const rateKey = keys.find(key => key.toLowerCase() === to.toLowerCase());

    // Truthiness here would report a present-but-zero rate as missing. The key
    // being absent is the only thing that makes a currency missing.
    if (rateKey === undefined) {
      // The full table is ~4KB and 166 currencies in production; naming the
      // currency and the size of the table is the part that helps.
      throw new Error(
        `No '${to}' present in rates (${keys.length} rate${
          keys.length === 1 ? "" : "s"
        } available).`
      );
    }

    const raw = rates[rateKey];

    // Number() coerces arrays, null and booleans into plausible numbers
    // (Number(["0.9"]) === 0.9), so the type is checked before the value.
    const numericRate =
      typeof raw === "number" || typeof raw === "string" ? Number(raw) : NaN;

    if (!Number.isFinite(numericRate) || numericRate <= 0) {
      throw new Error(
        `Invalid rate value for '${to}': expected a finite number greater than zero, received ${describeRate(
          raw
        )}.`
      );
    }

    return amount * numericRate;
  };

  /**
   * Rate fetch function.
   *
   * The fallback chain is a snapshot taken when the call starts, not the live
   * provider list. Two concurrent calls therefore each walk their own copy:
   * previously one call's `config.remove` shrank the list mid-flight and the
   * other spuriously ran out of providers.
   *
   * Only a permanent provider fault (a bad API key, say) removes a provider
   * from the shared list. A transient one is skipped for this call only, so a
   * single network blip no longer strips the chain for the process lifetime.
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

    let lastError: Error = new Error("No rate providers were tried.");

    for (let index = 0; index < chain.length; index++) {
      const provider = chain[index];

      // Fetching conversion rates from this provider.
      const [err, data] = await (<any>_to(
        fetchRates(client, provider, {
          FROM: from,
          TO: to,
          multiple: multiple
        })
      ));

      if (!err) {
        const rates = provider.handler(data);
        if (rates && typeof rates === "object") {
          Object.defineProperty(rates, RATES_BASE, {
            value: from,
            enumerable: false,
            configurable: true
          });
        }
        return rates;
      }

      // A rejection that does not follow the failure contract was not
      // classified by the requester, so there is nothing to fall back for.
      if (!isProviderFailure(err) || !err.handled) {
        throw asError(isProviderFailure(err) ? err.error : err);
      }

      // Reporting through the hook rather than straight to stderr.
      this.onError(err.error);

      // A permanent fault takes the provider out of the shared list; a
      // transient one is only skipped for this call.
      //
      // The last provider is never removed. The old code stopped before
      // emptying the list, and a converter with no providers left is dead for
      // the rest of the process — a worse outcome than reporting the fault.
      if (!err.transient && this.config.providers.length > 1) {
        this.config.remove(provider);
      }

      lastError = asError(err.error);
    }

    // Every provider in the snapshot failed.
    throw lastError;
  };
}
