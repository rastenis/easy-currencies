const { Converter } = require("../dist");
const to = require("await-to-js").default;
require("dotenv").config();

/**
 *  CurrencyLayer and Fixer api key level failures
 */
test("Fails because of insufficient key level (CurrencyLayer)", async () => {
  let converter = new Converter(
    "CurrencyLayer",
    process.env.CURRENCY_LAYER_KEY
  );

  let [err, value] = await to(converter.convert(15, "CNY", "EUR"));

  expect(err).toBeTruthy();
});

test("Fails because of insufficient key level (Fixer)", async () => {
  let converter = new Converter("Fixer", process.env.FIXER_KEY);

  let [err, value] = await to(converter.convert(15, "CNY", "EUR"));
  expect(err).toBeTruthy();
});

/**
 * Invalid api key failures
 */
test("Fails because of invalid key (CurrencyLayer)", async () => {
  let converter = new Converter("CurrencyLayer", "invalid");

  let [err, value] = await to(converter.convert(15, "CNY", "EUR"));

  expect(err).toBeTruthy();
});

test("Fails because of invalid key (Fixer)", async () => {
  let converter = new Converter("Fixer", "invalid");

  let [err, value] = await to(converter.convert(15, "CNY", "EUR"));

  expect(err).toBeTruthy();
});

test("Fails because of invalid key (OpenExchangeRates)", async () => {
  let converter = new Converter("OpenExchangeRates", "invalid");

  let [err, value] = await to(converter.convert(15, "CNY", "EUR"));

  expect(err).toBeTruthy();
});

test("Fails because of invalid key (AlphaVantage)", async () => {
  let converter = new Converter("AlphaVantage", "invalid");

  let [err, value] = await to(converter.convert(15, "CNY", "EUR"));

  expect(err).toBeTruthy();
});
