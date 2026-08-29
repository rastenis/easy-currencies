const { Converter } = require("../../../src");

/**
 * Assertions for live conversion results.
 *
 * These replace `expect(value).toBeGreaterThan(0); expect(value).toBeLessThan(30)`
 * for 15 USD -> EUR. That range could not fail: USD/EUR sits near parity, so 15
 * USD is ~12.9 EUR and the inverted answer is ~17.5 — both inside the band. A
 * base/quote swap, the single most likely way a provider integration breaks,
 * was undetectable, and no tighter band fixes it (EUR/USD crossed parity in
 * 2022, so even "less than the input" is a time bomb).
 *
 * Two properties are checked instead, and neither is expressible as a range on
 * a near-parity pair:
 *
 *  1. Direction, using a far-from-parity pair. USD/JPY is ~147, so an inverted
 *     rate lands near 0.1x the amount instead of ~147x — four orders of
 *     magnitude out, and no plausible FX move closes that gap.
 *  2. Agreement with an independent keyless provider, within 5%. This is the
 *     only thing the live suite can check that the offline fixtures cannot: a
 *     vendor quietly changing what its response means.
 */

/** Far from parity in both directions, and carried by every provider tested. */
const QUOTE = "JPY";

/** Providers usable as a second opinion without credentials. */
const KEYLESS = ["Frankfurter", "ExchangeRateAPI", "FloatRates"];

/** Vendors disagree by fractions of a percent; 5% is drift, not noise. */
const TOLERANCE = 0.05;

const cache = new Map();

/** A converter that cannot fall through to another provider. */
function only(name) {
  const converter = new Converter(name);
  while (converter.active.length > 1) {
    converter.remove(converter.active[1]);
  }
  return converter;
}

/**
 * The same conversion, from a keyless provider other than the one under test.
 * Cached: the reference is asked for the same few pairs by most of the suite.
 */
async function reference(amount, from, to, exclude) {
  const name = KEYLESS.find((n) => n !== exclude);
  const key = `${name}:${from}:${to}`;

  if (!cache.has(key)) {
    cache.set(key, only(name).convert(1, from, to));
  }
  return (await cache.get(key)) * amount;
}

/**
 * Asserts a live conversion result is a real rate applied the right way round.
 *
 * @param {number} value - the converted amount under test
 * @param {object} opts
 * @param {number} opts.amount - the amount that was converted
 * @param {string} opts.from - base currency
 * @param {string} [opts.to] - quote currency, defaulting to JPY
 * @param {string} [opts.provider] - the provider under test, excluded from the reference
 */
async function expectRealConversion(value, { amount, from, to = QUOTE, provider }) {
  expect(typeof value).toBe("number");
  expect(Number.isFinite(value)).toBe(true);

  // Direction. Every currency here is worth far less than one JPY-quoted unit,
  // so the result must be a large multiple of the amount. The bounds are wide
  // enough for any realistic rate (USD/JPY has ranged 75-160 this century) and
  // still nowhere near the ~0.1x an inverted conversion would produce.
  expect(value).toBeGreaterThan(amount * 20);
  expect(value).toBeLessThan(amount * 1000);

  // Agreement. Catches a vendor whose response stops meaning what we parse it
  // as, which a direction check alone would let through.
  const expected = await reference(amount, from, to, provider);
  expect(Math.abs(value - expected) / expected).toBeLessThan(TOLERANCE);
}

module.exports = { expectRealConversion, QUOTE };
