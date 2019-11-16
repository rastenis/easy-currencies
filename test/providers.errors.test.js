const { Converter } = require("../dist");
const to = require("await-to-js").default;

/**
 *  CurrencyLayer and Fixer api key level failures
 */
test("Fails because of insufficient key level (CurrencyLayer)", async () => {
  let converter = new Converter(
    "CurrencyLayer",
    process.env.CURRENCY_LAYER_KEY
  );
  // removing default fallback provider
  converter.remove(converter.active[1]);
  let [err, value] = await to(converter.convert(15, "CNY", "EUR"));

  expect(err).toBeTruthy();
});

test("Fails because of insufficient key level (Fixer)", async () => {
  let converter = new Converter("Fixer", process.env.FIXER_KEY);
  // removing default fallback provider
  converter.remove(converter.active[1]);
  let [err, value] = await to(converter.convert(15, "CNY", "EUR"));
  expect(err).toBeTruthy();
});

/**
 * Invalid api key failures
 */
test("Fails because of invalid key (CurrencyLayer)", async () => {
  let converter = new Converter("CurrencyLayer", "invalid");
  // removing default fallback provider
  converter.remove(converter.active[1]);
  let [err, value] = await to(converter.convert(15, "CNY", "EUR"));

  expect(err).toBeTruthy();
});

test("Fails because of invalid key (Fixer)", async () => {
  let converter = new Converter("Fixer", "invalid");
  // removing default fallback provider
  converter.remove(converter.active[1]);
  let [err, value] = await to(converter.convert(15, "CNY", "EUR"));

  expect(err).toBeTruthy();
});

test("Fails because of invalid key (OpenExchangeRates)", async () => {
  let converter = new Converter("OpenExchangeRates", "invalid");
  // removing default fallback provider
  converter.remove(converter.active[1]);
  let [err, value] = await to(converter.convert(15, "CNY", "EUR"));

  expect(err).toBeTruthy();
});

// AlphaVantage key checking is incorrect at the moment.
// test("Fails because of invalid key (AlphaVantage)", async () => {
//   let converter = new Converter("AlphaVantage", "");

//   let [err, value] = await to(converter.convert(15, "CNY", "EUR"));

//   expect(err).toBeTruthy();
// });
