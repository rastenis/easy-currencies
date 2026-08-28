const { Converter, Convert } = require("../../src");
const { _to } = require("../../src/parts/utils");

test("Fallback conversion", async () => {
  // invalid API key provider initialization
  const converter = new Converter("CurrencyLayer", "no key");

  const before = converter.config.providers.length;
  expect(before).toBeGreaterThan(1); // a bad key must have something to fall back to

  const [err, value] = await _to(converter.convert(15, "USD", "EUR"));

  // the provider with the bad key is dropped, the rest remain
  expect(converter.config.providers.length).toBe(before - 1);
  expect(err).toBe(null); // no error
  expect(typeof value).toBe("number"); // conversion result from fallback
});
