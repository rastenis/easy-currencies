const { Converter, Convert } = require("../../src");
const { _to } = require("../../src/parts/utils");

/**
 * An invalid base currency must be rejected by every provider.
 *
 * These assert THAT the conversion fails, not the exact wording. Vendors change
 * their error prose without notice — AlphaVantage swapped its invalid-call
 * message for a rate-limit notice, which failed this suite while the library
 * was behaving correctly. The offline contract suite pins the code-to-message
 * mapping; the job here is to catch a provider that stops rejecting bad input
 * at all, or starts failing for a new reason.
 */

/** Builds a converter with the implicit fallback removed, so the provider under test is the only one. */
function only(name, key) {
  const converter = key === undefined ? new Converter(name) : new Converter(name, key);
  while (converter.active.length > 1) {
    converter.remove(converter.active[1]);
  }
  return converter;
}

const PROVIDERS = [
  ["CurrencyLayer", process.env.CURRENCY_LAYER_KEY],
  ["Fixer", process.env.FIXER_KEY],
  ["AlphaVantage", process.env.ALPHA_VANTAGE_KEY],
  ["ExchangeRateAPI", undefined]
];

describe.each(PROVIDERS)("%s", (name, key) => {
  it("rejects an invalid base currency", async () => {
    const [err, value] = await _to(only(name, key).convert(15, "9q3j4fq938juf", "EUR"));

    expect(value).toBeNull();
    expect(err).toBeTruthy();
  }, 20000);

  it("does not return a number for an invalid base currency", async () => {
    const [, value] = await _to(only(name, key).convert(15, "CNYqqqwwC", "EUR"));

    // The failure mode that matters: a wrong number is worse than an error.
    expect(typeof value).not.toBe("number");
  }, 20000);
});

test("the chainable API rejects an invalid base currency", async () => {
  const [err, value] = await _to(Convert(15).from("invalid").to("EUR"));

  expect(value).toBeNull();
  expect(err).toBeTruthy();
}, 20000);
