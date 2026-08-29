const { Converter } = require("../../src");
const { _to } = require("../../src/parts/utils");

test("Fallback conversion", async () => {
  // invalid API key provider initialization
  const converter = new Converter("CurrencyLayer", "no key");
  converter.onError = () => {};

  const before = converter.config.providers.length;
  expect(before).toBeGreaterThan(1); // a bad key must have something to fall back to

  const [err, value] = await _to(converter.convert(15, "USD", "EUR"));

  // The chain is unchanged. This used to assert `before - 1`, from a time when
  // a failure evicted the provider; nothing has evicted since that was removed,
  // and a failure now applies to the call rather than to the converter.
  expect(converter.config.providers.length).toBe(before);
  expect(err).toBe(null); // no error
  expect(typeof value).toBe("number"); // conversion result from fallback
});

test("a bad primary costs a request on every call", async () => {
  // The flip side of not evicting, and the reason it is worth documenting: the
  // dead provider stays at the head of the chain and is tried every time.
  const converter = new Converter("CurrencyLayer", "no key");
  const seen = [];
  converter.onError = (e) => seen.push(e);

  await converter.convert(15, "USD", "EUR");
  await converter.convert(15, "USD", "EUR");

  expect(seen).toHaveLength(2);
});
