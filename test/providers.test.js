const { Converter } = require("../dist");

test("Converts an amount of given currency (ExchangeRateAPI).", async () => {
  const converter = new Converter("ExchangeRateAPI");

  const value = await converter.convert(15, "USD", "EUR");

  expect(typeof value).toBe("number");
  expect(value).toBeGreaterThan(0);
  expect(value).toBeLessThan(30);
}, 10000);

test("Converts an amount of given currency (OpenExchangeRates).", async () => {
  const converter = new Converter(
    "OpenExchangeRates",
    process.env.OPEN_EXCHANGE_RATES_KEY
  );

  const value = await converter.convert(15, "USD", "EUR");

  expect(typeof value).toBe("number");
  expect(value).toBeGreaterThan(0);
  expect(value).toBeLessThan(30);
}, 10000);

test("Converts an amount of given currency (AlphaVantage).", async () => {
  const converter = new Converter(
    "AlphaVantage",
    process.env.ALPHA_VANTAGE_KEY
  );

  const value = await converter.convert(15, "USD", "EUR");

  expect(typeof value).toBe("number");
  expect(value).toBeGreaterThan(0);
  expect(value).toBeLessThan(30);
}, 10000);

test("Converts an amount of given currency (ExchangeRatesAPIIO).", async () => {
  const converter = new Converter(
    "ExchangeRatesAPIIO",
    process.env.EXCHANGERATESAPI_IO_KEY
  );

  const value = await converter.convert(15, "EUR", "USD");

  expect(typeof value).toBe("number");
  expect(value).toBeGreaterThan(0);
  expect(value).toBeLessThan(30);
}, 10000);

/**
 * Omitting  CurrencyLayer and Fixer because they require paid keys to switch base currency
 */
// test("Converts an amount of given currency (CurrencyLayer)", async () => {
//   // default initialization
//   const converter = new Converter("CurrencyLayer", process.env.CURRENCY_LAYER_KEY);

//   const value = await converter.convert(15, "USD", "EUR");

//   expect(typeof value).toBe("number");
//   expect(value).toBeGreaterThan(0);
//   expect(value).toBeLessThan(30);
// });

// test("Converts an amount of given currency (Fixer)", async () => {
//   // default initialization
//   const converter = new Converter("Fixer", process.env.FIXER_KEY);

//   const value = await converter.convert(15, "USD", "EUR");

//   expect(typeof value).toBe("number");
//   expect(value).toBeGreaterThan(0);
//   expect(value).toBeLessThan(30);
// });
