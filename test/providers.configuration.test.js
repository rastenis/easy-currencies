const { providers } = require("../dist");

/**
 * These APIs are untested due to being gated behind paywalls in order to choose base currency.
 * Therefore, I must test their result handling separately.
 */

test("Result handling (CurrencyLayer).", async () => {
  expect(
    providers.CurrencyLayer.handler({ quotes: { USDGBP: 1 } })
  ).toStrictEqual({
    GBP: 1
  });
});

test("Result handling (Fixer).", async () => {
  expect(providers.Fixer.handler({ rates: { GBP: 1 } })).toStrictEqual({
    GBP: 1
  });
});

test("Error handling (CurrencyLayer).", async () => {
  expect(providers.CurrencyLayer.errorHandler({ error: { code: 1 } })).toEqual(
    1
  );
  expect(providers.CurrencyLayer.errorHandler({})).toEqual(null);
});

test("Error handling (Fixer).", async () => {
  expect(providers.Fixer.errorHandler({ error: { code: 1 } })).toEqual(1);
  expect(providers.Fixer.errorHandler({})).toEqual(null);
});
