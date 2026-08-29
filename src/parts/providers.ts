// Type only: converter.ts imports Provider/ProviderReference from this file, so
// this side of the cycle must stay type-only or it would need a runtime import back.
import type { rateObject } from "../converter";

/**
 * A map for provider information
 *
 * @interface Providers
 */
export interface Providers {
  [name: string]: Provider;
}

/**
 * Provider error entry
 *
 * @export
 * @interface ProviderErrors
 */
export interface ProviderErrors {
  [code: string]: string;
}

/**
 * Object that describes a user-defined provider.
 *
 * @export
 * @interface UserDefinedProvider
 */
export interface UserDefinedProvider {
  name: string;
  provider: Provider;
}

/**
 * Single provider interface.
 * Used to store pre-constructed query templates for various currency rate providers.
 * @export
 * @interface Provider
 */
export interface Provider {
  /**
   * An API key / Profile ID / Access key for a provider.
   *
   * @type {*}
   * @memberof Provider
   */
  // Public contract: consumers assign whatever shape their provider needs, and
  // requester.ts reads it back as opaque (`provider.key || ""`). Narrowing to
  // `unknown` would break every existing custom provider at compile time.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
  key: any;
  /**
   * Endpoint configuration object for a provider:
   * The base template is the root of the access URL, with a place for access key in the form of %KEY% (if needed)
   * The single template is used for single currency conversions, requires a %FROM% and a %TO% to be present.
   * @type {{ base: string; single: string }}
   * @memberof Provider
   */
  endpoint: { base: string; single: string };
  /**
   * A function that returns a map of currencies from the data object returned by the client (response.data)
   *
   * @example
   *  function(data) { //must return {currency1:rate1,curency2:rate2} in reference to the base currency.
   *    return data.rates;
   *  }
   *
   * @type {Function}
   * @memberof Provider
   */
  // `Function` accepted any callable and is flagged by no-unsafe-function-type;
  // this is the documented shape instead. The `any` parameter mirrors
  // errorHandler below for the same reason: user-defined handlers are compiled
  // against `any`, and narrowing it would break every existing custom provider.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
  handler: (data: any) => rateObject;
  /**
   * A map of possible errors and their respective messages
   *
   * @type {*}
   * @memberof Provider
   */
  errors: ProviderErrors;
  /**
   * A unique method to resolve errors, if any.
   * Some APIs return their errors via success responses, others via HTTP failures.
   * These two modes are mutually exclusive; The data passed to the errorHandler is:
   * the response.data object, in the case of 'success' failures
   * the response object, in the case of Axios errors (HTTP failures)
   *
   * @type {Function}
   * @memberof Provider
   */
  // Public contract: consumers write custom errorHandlers against `(data: any) =>
  // ...`. Narrowing this to `unknown` would break every existing custom provider
  // at compile time.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
  errorHandler: (data: any) => number | string | null;
}

/**
 * An interface for an object that is used to configure providers
 *
 * @export
 * @interface ProviderReference
 */
export interface ProviderReference {
  name: string;
  // Same public contract as Provider.key above: callers pass whatever key
  // shape their provider needs.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
  key: any;
}

/**
 * A function that constructs provider based on raw input data.
 *
 * @export
 * @param {ProviderReference} provider object containing provider name and api key
 * @returns {Provider} constructed provider
 */
export function resolveProvider(provider: ProviderReference): Provider {
  // Own-property check only. A plain lookup accepts "__proto__", "constructor"
  // and every other inherited key, and assigning the API key through
  // "__proto__" writes it onto Object.prototype.
  const name = provider?.name;
  if (typeof name !== "string" || !Object.prototype.hasOwnProperty.call(providers, name)) {
    throw new Error(
      "No provider with this name. Please use a provider from the supported providers list."
    );
  }

  // Copy, so instances do not share a template and overwrite each other's key.
  // `key` is `any` on both sides by the public contract (Provider.key,
  // ProviderReference.key), so this assignment carries no more risk than the
  // interfaces already declare.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- see above
  return { ...providers[name], key: provider.key };
}

/**
 * Narrows an unknown response body to a plain object, or undefined if it is
 * not one (including null, since typeof null === "object" would otherwise
 * slip through). Every built-in handler and errorHandler below starts here
 * instead of casting `data` ad hoc at each member access.
 */
function asRecord(data: unknown): Record<string, unknown> | undefined {
  return typeof data === "object" && data !== null
    ? (data as Record<string, unknown>)
    : undefined;
}

/**
 * Provider map initialization
 */
// Object.create(null) types as `any`, so Object.assign onto it does too; cast
// at the construction boundary rather than disabling the check, since this is
// the one place that must vouch for the literal actually matching Providers.
export const providers: Providers = Object.assign(Object.create(null), {
  ExchangeRateAPI: {
    endpoint: {
      base: "https://api.exchangerate-api.com/v4/latest/",
      single: "%FROM%"
    },
    key: undefined,
    handler: function (data: unknown) {
      return asRecord(data)?.rates as rateObject;
    },
    errors: { 400: "Malformed query.", 404: "Currency not found" },
    errorHandler: function (data: unknown) {
      return asRecord(data)?.status as number | string | null;
    }
  },
  ExchangeRatesAPIIO: {
    endpoint: {
      base: "https://api.exchangeratesapi.io/latest?access_key=%KEY%",
      single: "&base=%FROM%&symbols=%TO%"
    },
    errors: {
      105: "A paid plan is required in order to use other base currencies!",
      101: "Invalid API key!",
      201: "Invalid base currency."
    },
    key: undefined,
    handler: function (data: unknown) {
      return asRecord(data)?.rates as rateObject;
    },
    // apilayer signals failure in the body, not the HTTP status.
    errorHandler: function (data: unknown) {
      const code = asRecord(asRecord(data)?.error)?.code;
      return (code ?? null) as number | string | null;
    }
  },
  CurrencyLayer: {
    endpoint: {
      base: "https://apilayer.net/api/live?access_key=%KEY%",
      single: "&source=%FROM%"
    },
    key: undefined,
    handler: function (data: unknown) {
      // An empty or unexpected 200 body would otherwise throw a TypeError out
      // of the handler, which the caller reports as a missing response.
      // `quotes` must itself be a real object: quotes === null is a distinct
      // 200 shape, and asRecord folds it into "not usable" like every other
      // non-object case.
      const quotes = asRecord(asRecord(data)?.quotes);
      if (!quotes) {
        return {};
      }
      const map: rateObject = {};
      for (const key of Object.keys(quotes)) {
        map[key.slice(3)] = quotes[key] as number;
      }
      return map;
    },
    errors: {
      105: "A paid plan is required in order to use CurrencyLayer (base currency use not allowed)",
      101: "Invalid API key!",
      201: "Invalid base currency.",
      106: "No results."
    },
    errorHandler: function (data: unknown) {
      const code = asRecord(asRecord(data)?.error)?.code;
      return (code ?? null) as number | string | null;
    }
  },
  OpenExchangeRates: {
    endpoint: {
      base: "https://openexchangerates.org/api/latest.json?app_id=%KEY%",
      single: "&base=%FROM%"
    },
    key: undefined,
    handler: function (data: unknown) {
      return asRecord(data)?.rates as rateObject;
    },
    errors: {
      401: "Invalid API key!"
    },
    errorHandler: function (data: unknown) {
      return asRecord(data)?.status as number | string | null;
    }
  },
  AlphaVantage: {
    endpoint: {
      base: "https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&apikey=%KEY%",
      single: "&from_currency=%FROM%&to_currency=%TO%"
    },
    key: undefined,
    handler: function (data: unknown) {
      const map: rateObject = {};
      const record = asRecord(data);
      if (!record) {
        return map;
      }
      const firstKey = Object.keys(record)[0];
      const o = firstKey === undefined ? undefined : asRecord(record[firstKey]);
      // Same guard: an empty 200, or a first key holding a string rather than
      // an object, must not crash the handler.
      if (!o) {
        return map;
      }
      map[o["3. To_Currency Code"] as string] = o["5. Exchange Rate"] as number;
      return map;
    },
    errors: {
      429: "API rate limit reached.",
      503: "Invalid API key or Malformed query."
    },
    errorHandler: function (data: unknown) {
      const record = asRecord(data);
      if (!record) {
        return null;
      }
      // AlphaVantage does not return error codes in the response,
      // so we have to check if the response contains error messages
      // and translate them to error codes if possible.

      const hasError = record["Error Message"] || record["Information"];

      if (typeof hasError === "string" && hasError.includes("API rate limit")) {
        return 429;
      }

      if (hasError) {
        return hasError as string | number;
      }
      return null;
    }
  },
  Fixer: {
    endpoint: {
      base: "https://data.fixer.io/api/latest?access_key=%KEY%",
      single: "&base=%FROM%&symbols=%TO%"
    },
    key: undefined,
    handler: function (data: unknown) {
      return asRecord(data)?.rates as rateObject;
    },
    errors: {
      105: "A paid plan is required in order to use Fixer.io (base currency use not allowed)",
      101: "Invalid API key!",
      201: "Invalid base currency."
    },
    errorHandler: function (data: unknown) {
      const code = asRecord(asRecord(data)?.error)?.code;
      return (code ?? null) as number | string | null;
    }
  },
  Frankfurter: {
    // Keyless, ECB-sourced. `symbols` is deliberately not used: the API 404s on
    // a symbol outside its 29-currency set, so narrowing the response would turn
    // an unsupported target into an HTTP failure instead of a plain miss.
    endpoint: {
      base: "https://api.frankfurter.dev/v1/latest?base=",
      single: "%FROM%"
    },
    key: undefined,
    handler: function (data: unknown) {
      return asRecord(data)?.rates as rateObject;
    },
    // Verified live: an unknown base returns 404 with {"message":"not found"}.
    errors: { 404: "Currency not found or not supported by Frankfurter." },
    errorHandler: function (data: unknown) {
      return asRecord(data)?.status as number | string | null;
    }
  },
  FloatRates: {
    // Keyless. The path segment is a currency code; the host accepts it in
    // upper case, so no case transform is needed.
    endpoint: {
      base: "https://www.floatrates.com/daily/",
      single: "%FROM%.json"
    },
    key: undefined,
    handler: function (data: unknown) {
      const map: rateObject = {};
      const record = asRecord(data);
      if (!record) {
        return map;
      }
      for (const key of Object.keys(record)) {
        const entry = asRecord(record[key]);
        if (entry) {
          map[entry.code as string] = parseFloat(entry.rate as string);
        }
      }
      return map;
    },
    // Verified live: an unknown currency returns 403 with an empty body.
    errors: { 403: "Currency not found or not supported by FloatRates." },
    errorHandler: function (data: unknown) {
      return asRecord(data)?.status as number | string | null;
    }
  }
}) as Providers;

// Templates are copied on resolve; freezing makes accidental mutation of the
// shared definitions fail loudly rather than silently affecting every future
// Converter.
for (const name of Object.keys(providers)) {
  Object.freeze(providers[name].endpoint);
  Object.freeze(providers[name].errors);
  Object.freeze(providers[name]);
}

// Sealed, not frozen: `addMultiple` still registers user-defined providers, but
// a built-in can no longer be deleted or replaced out from under every
// Converter in the process.
Object.seal(providers);
