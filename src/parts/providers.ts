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
  key: any;
  /**
   * Endpoint configuration object for a provider:
   * The base template is the root of the access URL, with a place for access key in the form of %KEY% (if needed)
   * The single template is used for single currency conversions, requires a %FROM% and a %TO% to be present.
   * The multiple template is currently unused.
   * @type {{ base: string; single: string; multiple: string }}
   * @memberof Provider
   */
  endpoint: { base: string; single: string; multiple: string };
  /**
   * A function that returns a map of currencies from the data object returned by axios (response.data)
   *
   * @example
   *  function(data) { //must return {currency1:rate1,curency2:rate2} in reference to the base currency.
   *    return data.rates;
   *  }
   *
   * @type {Function}
   * @memberof Provider
   */
  handler: Function;
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
  errorHandler: Function;
}

/**
 * An interface for an object that is used to configure providers
 *
 * @export
 * @interface ProviderReference
 */
export interface ProviderReference {
  name: string;
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
  const existentProvider = providers[provider.name];
  if (!existentProvider) {
    throw "No provider with this name. Please use a provider from the supported providers list.";
  }

  // attaching key
  existentProvider.key = provider.key;
  return existentProvider;
}

/**
 * Provider map initialization
 */
export const providers: Providers = {
  ExchangeRateAPI: {
    endpoint: {
      base: "https://api.exchangerate-api.com/v4/latest/",
      single: "%FROM%",
      multiple: "%FROM%"
    },
    key: undefined,
    handler: function (data: any) {
      return data.rates;
    },
    errors: { 400: "Malformed query.", 404: "Currency not found" },
    errorHandler: function (data: any) {
      return data.status;
    }
  },
  ExchangeRatesAPIIO: {
    endpoint: {
      base: "http://api.exchangeratesapi.io/latest?access_key=%KEY%",
      single: "&base=%FROM%&symbols=%TO%",
      multiple: "&base=%FROM%"
    },
    errors: {
      105: "A paid plan is required in order to use other base currencies!",
      101: "Invalid API key!",
      201: "Invalid base currency."
    },
    key: undefined,
    handler: function (data: any) {
      return data.rates;
    },
    errorHandler: function (data: any) {
      return data.status;
    }
  },
  CurrencyLayer: {
    endpoint: {
      base: "http://apilayer.net/api/live?access_key=%KEY%",
      single: "&source=%FROM%",
      multiple: "&source=%FROM%&currencies=%TO%"
    },
    key: undefined,
    handler: function (data: any) {
      const map = {} as any;
      Object.keys(data.quotes).map((key) => {
        map[key.slice(3)] = data.quotes[key];
      });
      return map;
    },
    errors: {
      105: "A paid plan is required in order to use CurrencyLayer (base currency use not allowed)",
      101: "Invalid API key!",
      201: "Invalid base currency.",
      106: "No results."
    },
    errorHandler: function (data: any) {
      return data.error ? data.error.code : null;
    }
  },
  OpenExchangeRates: {
    endpoint: {
      base: "https://openexchangerates.org/api/latest.json?app_id=%KEY%",
      single: "&base=%FROM%",
      multiple: "&base=%FROM%"
    },
    key: undefined,
    handler: function (data: any) {
      return data.rates;
    },
    errors: {
      401: "Invalid API key!"
    },
    errorHandler: function (data: any) {
      return data.status;
    }
  },
  AlphaVantage: {
    endpoint: {
      base: "https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&apikey=%KEY%",
      single: "&from_currency=%FROM%&to_currency=%TO%",
      multiple: ""
    },
    key: undefined,
    handler: function (data: any) {
      const map = {} as any;
      const o = data[Object.keys(data)[0]];
      map[o["3. To_Currency Code"]] = o["5. Exchange Rate"];
      return map;
    },
    errors: {
      503: "Invalid API key or Malformed query."
    },
    errorHandler: function (data: any) {
      return data["Error Message"] ? 503 : false;
    }
  },
  Fixer: {
    endpoint: {
      base: "http://data.fixer.io/api/latest?access_key=%KEY%",
      single: "&base=%FROM%&symbols=%TO%",
      multiple: "&base=%FROM%"
    },
    key: undefined,
    handler: function (data: any) {
      return data.rates;
    },
    errors: {
      105: "A paid plan is required in order to use Fixer.io (base currency use not allowed)",
      101: "Invalid API key!",
      201: "Invalid base currency."
    },
    errorHandler: function (data: any) {
      return data.error ? data.error.code : null;
    }
  }
};
