/**
 * The provider contract table.
 *
 * Every supported provider is described here once: the URL it must build, a
 * realistic success payload, and a realistic error payload. The contract suite
 * runs the same assertions across every row, so adding a provider to
 * `src/parts/providers.ts` and a row here gives it full coverage.
 *
 * Payload shapes mirror what each vendor actually returns; keep them realistic,
 * because they are the only description of vendor behaviour the offline suite has.
 */

/** Fixed rate used across all fixtures, so expected values stay obvious. */
export const RATE = 0.9;
export const AMOUNT = 15;
export const EXPECTED = AMOUNT * RATE; // 13.5

export interface ProviderFixture {
  /** Provider name as registered in `providers`. */
  name: string;
  /** API key to configure, or undefined for keyless providers. */
  key?: string;
  /** Exact URL expected for a USD -> EUR single conversion. */
  url: string;
  /** A success response body that yields RATE for EUR. */
  success: any;
  /**
   * An error the provider is expected to recognise and map to a message.
   * `http` means the vendor signals it via an HTTP failure status; otherwise
   * the error arrives inside a 200 response body.
   */
  handledError?: { payload?: any; http?: number; message: string };
  /**
   * An error the provider does NOT map to a known message, which must surface
   * as an unhandled error rather than triggering silent fallback.
   */
  unhandledError?: { payload?: any; http?: number; error: any };
}

const KEY = "TEST_KEY";

export const PROVIDER_FIXTURES: ProviderFixture[] = [
  {
    name: "ExchangeRateAPI",
    url: "https://api.exchangerate-api.com/v4/latest/USD",
    success: { rates: { EUR: RATE } },
    handledError: { http: 404, message: "Currency not found" }
  },
  {
    name: "ExchangeRatesAPIIO",
    key: KEY,
    url: `http://api.exchangeratesapi.io/latest?access_key=${KEY}&base=USD&symbols=EUR`,
    success: { rates: { EUR: RATE } },
    handledError: { payload: { status: 101 }, message: "Invalid API key!" }
  },
  {
    name: "CurrencyLayer",
    key: KEY,
    url: `http://apilayer.net/api/live?access_key=${KEY}&source=USD`,
    // CurrencyLayer prefixes every quote with the source currency.
    success: { quotes: { USDEUR: RATE } },
    handledError: {
      payload: { error: { code: 101 } },
      message: "Invalid API key!"
    }
  },
  {
    name: "OpenExchangeRates",
    key: KEY,
    url: `https://openexchangerates.org/api/latest.json?app_id=${KEY}&base=USD`,
    success: { rates: { EUR: RATE } },
    handledError: { http: 401, message: "Invalid API key!" }
  },
  {
    name: "AlphaVantage",
    key: KEY,
    url: `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&apikey=${KEY}&from_currency=USD&to_currency=EUR`,
    // AlphaVantage nests the quote under a single verbose key and returns the
    // rate as a string, not a number.
    success: {
      "Realtime Currency Exchange Rate": {
        "1. From_Currency Code": "USD",
        "3. To_Currency Code": "EUR",
        "5. Exchange Rate": String(RATE)
      }
    },
    // AlphaVantage signals failure with prose, which the provider surfaces
    // verbatim because its `errors` map has no matching entry.
    unhandledError: {
      payload: { "Error Message": "Invalid API call." },
      error: "Invalid API call."
    }
  },
  {
    name: "Fixer",
    key: KEY,
    url: `http://data.fixer.io/api/latest?access_key=${KEY}&base=USD&symbols=EUR`,
    success: { rates: { EUR: RATE } },
    handledError: {
      payload: { error: { code: 101 } },
      message: "Invalid API key!"
    }
  }
];
