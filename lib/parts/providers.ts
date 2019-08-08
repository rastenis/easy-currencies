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
  endpoint: { single: string; multiple: string };
  handler: Function | undefined;
}

/**
 * Provider map initialization
 */
export const providers: Providers = {
  ExchangeRatesAPI: {
    endpoint: {
      single: "https://api.exchangeratesapi.io/latest?base=%FROM%&symbols=%TO%",
      multiple: "https://api.exchangeratesapi.io/latest?base=%FROM%"
    },
    keyNeeded: false,
    key: null,
    handler: function(data) {
      return data.rates;
    }
  },
  OpenExchangeRates: {
    endpoint: { single: "", multiple: "" },
    keyNeeded: true,
    key: undefined,
    handler: undefined
  },
  Fixer: {
    endpoint: { single: "", multiple: "" },
    keyNeeded: true,
    key: undefined,
    handler: undefined
  },
  IBAN: {
    endpoint: { single: "", multiple: "" },
    keyNeeded: true,
    key: undefined,
    handler: undefined
  },
  CurrencyLayer: {
    endpoint: { single: "", multiple: "" },
    keyNeeded: true,
    key: undefined,
    handler: undefined
  },
  Happi: {
    endpoint: { single: "", multiple: "" },
    keyNeeded: true,
    key: undefined,
    handler: undefined
  }
};
