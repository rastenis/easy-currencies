const { Converter } = require("../../src");
const { _to } = require("../../src/parts/utils");

/** Strips every fallback, so the provider under test is the only one left. */
function isolate(converter) {
  while (converter.active.length > 1) {
    converter.remove(converter.active[1]);
  }
  return converter;
}

/**
 *  Fixer api key level failures
 */

test("Fails because of insufficient key level (Fixer)", async () => {
  const converter = new Converter("Fixer", process.env.FIXER_KEY);
  isolate(converter);
  const [err, value] = await _to(converter.convert(15, "CNY", "EUR"));

  expect(typeof err === "string" ? err : err && err.message).toBeTruthy();
  expect(value).toBeNull();
});

/**
 * Invalid api key failures
 */
test("Fails because of invalid key (CurrencyLayer)", async () => {
  const converter = new Converter("CurrencyLayer", "invalid");
  isolate(converter);
  const [err, value] = await _to(converter.convert(15, "CNY", "EUR"));

  expect(typeof err === "string" ? err : err && err.message).toBeTruthy();
  expect(value).toBeNull();
});

test("Fails because of invalid key (Fixer)", async () => {
  const converter = new Converter("Fixer", "invalid");
  isolate(converter);
  const [err, value] = await _to(converter.convert(15, "CNY", "EUR"));

  expect(typeof err === "string" ? err : err && err.message).toBeTruthy();
  expect(value).toBeNull();
});

test("Fails because of invalid key (OpenExchangeRates)", async () => {
  const converter = new Converter("OpenExchangeRates", "invalid");
  isolate(converter);
  const [err, value] = await _to(converter.convert(15, "CNY", "EUR"));

  expect(typeof err === "string" ? err : err && err.message).toBeTruthy();
  expect(value).toBeNull();
});

test("Fails because of invalid key (AlphaVantage)", async () => {
  const converter = new Converter("AlphaVantage", "");

  const [err, value] = await _to(converter.convert(15, "CNY", "EUR"));

  expect(typeof err === "string" ? err : err && err.message).toBeTruthy();
  expect(value).toBeNull();
});
