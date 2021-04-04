const { Converter, Convert } = require("../dist");
const to = require("await-to-js").default;
/**
 * Invalid currencies
 */
test("Fails because of invalid base currency (CurrencyLayer)", async () => {
  const converter = new Converter(
    "CurrencyLayer",
    process.env.CURRENCY_LAYER_KEY
  );
  // removing default fallback provider
  converter.remove(converter.active[1]);
  const [err, value] = await to(converter.convert(15, "CNYqqqwwC", "EUR"));
  expect(err).toBe("Invalid base currency.");
});

test("Fails because of invalid base currency (Fixer)", async () => {
  const converter = new Converter("Fixer", process.env.FIXER_KEY);
  // removing default fallback provider
  converter.remove(converter.active[1]);
  const [err, value] = await to(converter.convert(15, "CNYqqqwwC", "EUR"));

  expect(err).toBe("Invalid base currency.");
});

test("Fails because of invalid base currency (AlphaVantage)", async () => {
  const converter = new Converter(
    "AlphaVantage",
    process.env.ALPHA_VANTAGE_KEY
  );
  // removing default fallback provider
  converter.remove(converter.active[1]);

  const [err, value] = await to(converter.convert(15, "CNYqqqwwC", "EUR"));

  expect(err).toBe("Invalid API key or Malformed query.");
});

test("Chainer fails because of invalid base currency (ExchangeRateAPI)", async () => {
  const [err, value] = await to(Convert(15).from("invalid").to("EUR"));

  expect(err).toBe("Currency not found");
});

test("Fails because of invalid base currency (ExchangeRateAPI)", async () => {
  const converter = new Converter("ExchangeRateAPI");
  // removing default fallback provider
  const [err, value] = await to(converter.convert(15, "invalid", "EUR"));

  expect(err).toBe("Currency not found");
});
