const { Converter } = require("../dist");
require("dotenv").config();

test("Converts an amount of given currency (ExchangeRatesAPI).", async () => {
  // default initialization
  let converter = new Converter("ExchangeRatesAPI");

  let value = await converter.convert(15, "USD", "EUR");

  expect(typeof value).toBe("number");
  expect(value).toBeGreaterThan(0);
  expect(value).toBeLessThan(30);
});

test("Converts an amount of given currency (OpenExchangeRates).", async () => {
  // default initialization
  let converter = new Converter(
    "OpenExchangeRates",
    process.env.OPEN_EXCHANGE_RATES_KEY
  );

  let value = await converter.convert(15, "USD", "EUR");

  expect(typeof value).toBe("number");
  expect(value).toBeGreaterThan(0);
  expect(value).toBeLessThan(30);
});

test("Converts an amount of given currency (AlphaVantage).", async () => {
  // default initialization
  let converter = new Converter("AlphaVantage", process.env.ALPHA_VANTAGE_KEY);

  let value = await converter.convert(15, "USD", "EUR");

  expect(typeof value).toBe("number");
  expect(value).toBeGreaterThan(0);
  expect(value).toBeLessThan(30);
});

/**
 * Omitting  CurrencyLayer and Fixer because they require paid keys to switch base currency
 */
// test("Converts an amount of given currency (CurrencyLayer)", async () => {
//   // default initialization
//   let converter = new Converter("CurrencyLayer", process.env.CURRENCY_LAYER_KEY);

//   let value = await converter.convert(15, "USD", "EUR");

//   expect(typeof value).toBe("number");
//   expect(value).toBeGreaterThan(0);
//   expect(value).toBeLessThan(30);
// });

// test("Converts an amount of given currency (Fixer)", async () => {
//   // default initialization
//   let converter = new Converter("Fixer", process.env.FIXER_KEY);

//   let value = await converter.convert(15, "USD", "EUR");

//   expect(typeof value).toBe("number");
//   expect(value).toBeGreaterThan(0);
//   expect(value).toBeLessThan(30);
// });
