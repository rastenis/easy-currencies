/**
 * The provider contract table: adding a provider to src/parts/providers.ts and a
 * row here gives it full coverage.
 *
 * These payloads are the only description of vendor behaviour the offline suite
 * has, so they must match what the vendor really returns — a shape invented to
 * make a test pass hides exactly the bug this table exists to catch.
 */

export const AMOUNT = 15;
export const RATE = 0.9;
export const EXPECTED = 13.5;

export interface ProviderFixture {
  name: string;
  key?: string;
  /** Expected URL for a USD -> EUR conversion. */
  url: string;
  success: any;
  /** An error the provider maps to a documented message. `http` if the vendor signals it by status rather than in a 200 body. */
  handledError?: { payload?: any; http?: number; message: string };
  /** An error the provider does not map, which must surface rather than triggering silent fallback. */
  unhandledError?: { payload?: any; http?: number; error: any };
  /** How the provider rejects a 200 response containing no usable rate. */
  emptyResponse: RegExp;
}

// Distinct per provider, so a key leaking between instances is visible rather than silently equal.
const key = (name: string) => `KEY_${name.toUpperCase()}`;

const NO_RATE = /No data returned for rate fetch|No 'EUR' present in rates/;

export const PROVIDER_FIXTURES: ProviderFixture[] = [
  {
    name: "ExchangeRateAPI",
    url: "https://api.exchangerate-api.com/v4/latest/USD",
    success: { rates: { EUR: RATE } },
    handledError: { http: 404, message: "Currency not found" },
    emptyResponse: NO_RATE
  },
  {
    name: "ExchangeRatesAPIIO",
    key: key("ExchangeRatesAPIIO"),
    url: `http://api.exchangeratesapi.io/latest?access_key=${key(
      "ExchangeRatesAPIIO"
    )}&base=USD&symbols=EUR`,
    success: { rates: { EUR: RATE } },
    // Verified against the live endpoint: apilayer returns { error: { code } },
    // but this provider's errorHandler reads data.status, so 101/105/201 are all
    // unreachable — no error of any kind is recognised. See "known defects".
    emptyResponse: NO_RATE
  },
  {
    name: "CurrencyLayer",
    key: key("CurrencyLayer"),
    url: `http://apilayer.net/api/live?access_key=${key("CurrencyLayer")}&source=USD`,
    // Quotes are prefixed with the source currency.
    success: { quotes: { USDEUR: RATE } },
    handledError: { payload: { error: { code: 101 } }, message: "Invalid API key!" },
    emptyResponse: NO_RATE
  },
  {
    name: "OpenExchangeRates",
    key: key("OpenExchangeRates"),
    url: `https://openexchangerates.org/api/latest.json?app_id=${key(
      "OpenExchangeRates"
    )}&base=USD`,
    success: { rates: { EUR: RATE } },
    handledError: { http: 401, message: "Invalid API key!" },
    emptyResponse: NO_RATE
  },
  {
    name: "AlphaVantage",
    key: key("AlphaVantage"),
    url: `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&apikey=${key(
      "AlphaVantage"
    )}&from_currency=USD&to_currency=EUR`,
    // The rate comes back as a string, not a number.
    success: {
      "Realtime Currency Exchange Rate": {
        "1. From_Currency Code": "USD",
        "3. To_Currency Code": "EUR",
        "5. Exchange Rate": String(RATE)
      }
    },
    // AlphaVantage signals failure with prose; its errors map has no matching
    // entry, so the message surfaces verbatim.
    unhandledError: {
      payload: { "Error Message": "Invalid API call." },
      error: "Invalid API call."
    },
    emptyResponse: NO_RATE
  },
  {
    name: "Fixer",
    key: key("Fixer"),
    url: `http://data.fixer.io/api/latest?access_key=${key("Fixer")}&base=USD&symbols=EUR`,
    success: { rates: { EUR: RATE } },
    handledError: { payload: { error: { code: 101 } }, message: "Invalid API key!" },
    emptyResponse: NO_RATE
  }
];
