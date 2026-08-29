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
  /**
   * Additional 200 payloads that must also fall through to `emptyResponse`
   * rather than throwing a raw TypeError out of the handler. Beyond the plain
   * `{}` every fixture is already checked against, these pin the specific
   * shapes each provider's handler guards against.
   */
  extraEmptyResponses?: any[];
}

// Distinct per provider, so a key leaking between instances is visible rather than silently equal.
const key = (name: string) => `KEY_${name.toUpperCase()}`;

// A provider can decline an empty body at three depths: the handler returns
// nothing, it returns a table with nothing usable in it, or the table is fine
// and simply lacks the requested code. All three are that provider's failure.
const NO_RATE = /no usable rates|No data returned for rate fetch|No 'EUR' present in rates/;

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
    url: `https://api.exchangeratesapi.io/latest?access_key=${key(
      "ExchangeRatesAPIIO"
    )}&base=USD&symbols=EUR`,
    success: { rates: { EUR: RATE } },
    // Verified against the live endpoint: apilayer signals in the body.
    handledError: { payload: { error: { code: 101 } }, message: "Invalid API key!" },
    emptyResponse: NO_RATE
  },
  {
    name: "CurrencyLayer",
    key: key("CurrencyLayer"),
    url: `https://apilayer.net/api/live?access_key=${key("CurrencyLayer")}&source=USD`,
    // Quotes are prefixed with the source currency.
    success: { quotes: { USDEUR: RATE } },
    handledError: { payload: { error: { code: 101 } }, message: "Invalid API key!" },
    emptyResponse: NO_RATE,
    // `quotes: null` is a distinct 200 shape from a missing `quotes`: typeof
    // null is "object", so it needs its own guard in the handler.
    extraEmptyResponses: [{ quotes: null }]
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
    emptyResponse: NO_RATE,
    // The first key holding a string rather than an object: `!o` alone would
    // miss it, since a non-empty string is truthy.
    extraEmptyResponses: [{ "Realtime Currency Exchange Rate": "unexpected string" }]
  },
  {
    name: "Fixer",
    key: key("Fixer"),
    url: `https://data.fixer.io/api/latest?access_key=${key("Fixer")}&base=USD&symbols=EUR`,
    success: { rates: { EUR: RATE } },
    handledError: { payload: { error: { code: 101 } }, message: "Invalid API key!" },
    emptyResponse: NO_RATE
  },
  {
    name: "Frankfurter",
    url: "https://api.frankfurter.dev/v1/latest?base=USD",
    // Real shape, trimmed: the body carries amount/base/date alongside `rates`.
    success: { amount: 1.0, base: "USD", date: "2026-08-27", rates: { EUR: RATE } },
    // Verified live: GET /v1/latest?base=XYZ -> 404 {"message":"not found"}.
    handledError: { http: 404, payload: { message: "not found" }, message: "Currency not found or not supported by Frankfurter." },
    emptyResponse: NO_RATE
  },
  {
    name: "FloatRates",
    url: "https://www.floatrates.com/daily/USD.json",
    // Real shape, trimmed: keys are lower case, rates are strings.
    success: {
      eur: {
        code: "EUR",
        alphaCode: "EUR",
        numericCode: "978",
        name: "Euro",
        rate: String(RATE),
        date: "Thu, 27 Aug 2026 23:59:00 GMT",
        inverseRate: "1.11111111"
      }
    },
    // Verified live: GET /daily/XYZ.json -> 403 with an empty (unparseable) body.
    handledError: { http: 403, message: "Currency not found or not supported by FloatRates." },
    emptyResponse: NO_RATE
  }
];
