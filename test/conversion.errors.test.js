const { Converter, Convert } = require("../dist");
const to = require("await-to-js").default;
/**
 * Invalid currencies
 */
test("Fails because of invalid base currency (CurrencyLayer)", async () => {
  let converter = new Converter(
    "CurrencyLayer",
    process.env.CURRENCY_LAYER_KEY
  );

  let [err, value] = await to(converter.convert(15, "CNYqqqwwC", "EUR"));
  expect(err).toBe("Invalid base currency.");
});

test("Fails because of invalid base currency (Fixer)", async () => {
  let converter = new Converter("Fixer", process.env.FIXER_KEY);

  let [err, value] = await to(converter.convert(15, "CNYqqqwwC", "EUR"));

  expect(err).toBe("Invalid base currency.");
});

test("Fails because of invalid base currency (AlphaVantage)", async () => {
  let converter = new Converter("AlphaVantage", process.env.ALPHA_VANTAGE_KEY);

  let [err, value] = await to(converter.convert(15, "CNYqqqwwC", "EUR"));

  expect(err).toBe("Invalid API key or Malformed query.");
});

test("Fails because of invalid base currency (ExchangeRatesAPI)", async () => {
  let converter = new Converter("ExchangeRatesAPI");

  let [err, value] = await to(converter.convert(15, "CNYqqqwwC", "EUR"));

  expect(err).toBe("Malformed query.");
});

test("Chainer fails because of invalid base currency (ExchangeRatesAPI)", async () => {
  let [err, value] = await to(
    Convert(15)
      .from("CNYqqqwwC")
      .to("EUR")
  );

  expect(err).toBe("Malformed query.");
});
