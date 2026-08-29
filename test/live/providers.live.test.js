const { Converter } = require("../../src");
const { expectRealConversion, QUOTE } = require("./helpers/liveRate");

/**
 * One live conversion per provider, checked for direction and for agreement
 * with an independent keyless provider. See helpers/liveRate.js for why a
 * plain range on 15 USD -> EUR could not fail.
 *
 * CurrencyLayer and Fixer are omitted: both require a paid key to choose a base
 * currency, so there is no conversion they can serve here.
 */

const AMOUNT = 15;

/** A converter with the implicit fallbacks removed, so the named provider answers. */
function only(name, key) {
  const converter = key === undefined ? new Converter(name) : new Converter(name, key);
  while (converter.active.length > 1) {
    converter.remove(converter.active[1]);
  }
  return converter;
}

const PROVIDERS = [
  ["ExchangeRateAPI", undefined, "USD"],
  ["OpenExchangeRates", process.env.OPEN_EXCHANGE_RATES_KEY, "USD"],
  ["AlphaVantage", process.env.ALPHA_VANTAGE_KEY, "USD"],
  // The free ExchangeRatesAPI.io plan is locked to a EUR base.
  ["ExchangeRatesAPIIO", process.env.EXCHANGERATESAPI_IO_KEY, "EUR"],
  ["Frankfurter", undefined, "USD"],
  ["FloatRates", undefined, "USD"]
];

describe.each(PROVIDERS)("%s", (name, key, from) => {
  it("converts at a rate that matches an independent provider", async () => {
    const value = await only(name, key).convert(AMOUNT, from, QUOTE);

    await expectRealConversion(value, {
      amount: AMOUNT,
      from,
      provider: name
    });
  }, 20000);
});
