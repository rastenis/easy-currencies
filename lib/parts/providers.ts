/**
 * A map for provider information
 *
 * @interface Providers
 */
export interface Providers {
  [name: string]: Provider;
}

/**
 * Single provider interface.
 * Used to store pre-constructed query templates for various currency rate providers.
 * @export
 * @interface Provider
 */
export interface Provider {
  keyNeeded: boolean;
  key: any;
  endpoint: { base: string; single: string; multiple: string };
  handler: Function;
  errors: any;
  errorHandler: Function;
}

/**
 * A function that constructs provider based on raw input data.
 *
 * @export
 * @param {*} provider object containing provider name and api key
 * @returns {Provider} constructed provider
 */
export function resolveProvider(provider: any): Provider {
  let p = providers[provider.name];
  if (!p) {
    throw "No provider with this name. Please use a provider from the supported providers list.";
  }

  // attaching key
  p.key = provider.key;
  return p;
}

/**
 * Provider map initialization
 */
export const providers: Providers = {
  ExchangeRatesAPI: {
    endpoint: {
      base: "https://api.exchangeratesapi.io/latest",
      single: "?base=%FROM%&symbols=%TO%",
      multiple: "?base=%FROM%"
    },
    keyNeeded: false,
    key: null,
    handler: function(data) {
      return data.rates;
    },
    errors: {},
    errorHandler: function(data) {
      return data.error;
    }
  },
  CurrencyLayer: {
    endpoint: {
      base: "http://apilayer.net/api/live?access_key=%KEY%",
      single: "&source=%FROM%",
      multiple: "&source=%FROM%&currencies=%TO%"
    },
    keyNeeded: true,
    key: undefined,
    handler: function(data) {
      let map = {};
      Object.keys(data.quotes).map(key => {
        map[key.slice(3)] = data.quotes[key];
      });
      return map;
    },
    errors: {
      105: "A paid plan is required in order to use CurrencyLayer (base currency use not allowed)",
      101: "Invalid API key!"
    },
    errorHandler: function(data) {
      return data.error ? data.error.code : null;
    }
  },
  OpenExchangeRates: {
    endpoint: {
      base: "https://openexchangerates.org/api/latest.json?app_id=%KEY%",
      single: "&base=%FROM%",
      multiple: "&base=%FROM%"
    },
    keyNeeded: true,
    key: undefined,
    handler: function(data) {
      return data.rates;
    },
    errors: {
      401: "Invalid API key!"
    },
    errorHandler: function(data) {
      return data.status;
    }
  },
  AlphaVantage: {
    endpoint: {
      base:
        "https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&apikey=%KEY%",
      single: "&from_currency=%FROM%&to_currency=%TO%",
      multiple: ""
    },
    keyNeeded: true,
    key: undefined,
    handler: function(data) {
      let map = {};
      let o = data[Object.keys(data)[0]];
      map[o["3. To_Currency Code"]] = o["5. Exchange Rate"];
      return map;
    },
    errors: {
      503: "Invalid API key."
    },
    errorHandler: function(data) {
      return data["Error Message"] ? 503 : false;
    }
  },
  Fixer: {
    endpoint: {
      base: "http://data.fixer.io/api/latest?access_key=%KEY%",
      single: "&base=%FROM%&symbols=%TO%",
      multiple: "&base=%FROM%"
    },
    keyNeeded: true,
    key: undefined,
    handler: function(data) {
      return data.rates;
    },
    errors: {
      105: "A paid plan is required in order to use Fixer.io (base currency use not allowed)",
      101: "Invalid API key!"
    },
    errorHandler: function(data) {
      return data.error ? data.error.code : null;
    }
  }
};
