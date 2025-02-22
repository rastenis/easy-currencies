const { Converter } = require("../dist");
const { _to } = require("../dist/parts/utils");

/**
 *  Fixer api key level failures
 */

test("Fails because of insufficient key level (Fixer)", async () => {
  const converter = new Converter("Fixer", process.env.FIXER_KEY);
  // removing default fallback provider
  converter.remove(converter.active[1]);
  const [err, value] = await _to(converter.convert(15, "CNY", "EUR"));

  expect(err).toBeTruthy();
});

/**
 * Invalid api key failures
 */
test("Fails because of invalid key (CurrencyLayer)", async () => {
  const converter = new Converter("CurrencyLayer", "invalid");
  // removing default fallback provider
  converter.remove(converter.active[1]);
  const [err, value] = await _to(converter.convert(15, "CNY", "EUR"));

  expect(err).toBeTruthy();
});

test("Fails because of invalid key (Fixer)", async () => {
  const converter = new Converter("Fixer", "invalid");
  // removing default fallback provider
  converter.remove(converter.active[1]);
  const [err, value] = await _to(converter.convert(15, "CNY", "EUR"));

  expect(err).toBeTruthy();
});

test("Fails because of invalid key (OpenExchangeRates)", async () => {
  const converter = new Converter("OpenExchangeRates", "invalid");
  // removing default fallback provider
  converter.remove(converter.active[1]);
  const [err, value] = await _to(converter.convert(15, "CNY", "EUR"));

  expect(err).toBeTruthy();
});

test("Fails because of invalid key (AlphaVantage)", async () => {
  const converter = new Converter("AlphaVantage", "");

  const [err, value] = await _to(converter.convert(15, "CNY", "EUR"));

  expect(err).toBeTruthy();
});
