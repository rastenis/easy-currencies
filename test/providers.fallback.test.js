const { Converter, Convert } = require("../dist");
const { _to } = require("../dist/parts/utils");

test("Fallback conversion", async () => {
  // invalid API key provider initialization
  const converter = new Converter("CurrencyLayer", "no key");

  expect(converter.config.providers.length).toBe(2);

  const [err, value] = await _to(converter.convert(15, "USD", "EUR"));

  expect(converter.config.providers.length).toBe(1); // removed invalid provider
  expect(err).toBe(null); // no error
  expect(typeof value).toBe("number"); // conversion result from fallback
});
