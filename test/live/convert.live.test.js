const { Convert } = require("../../src");
const { expectRealConversion, QUOTE } = require("./helpers/liveRate");

const AMOUNT = 15;

test("Converts (chained) an amount of given currency.", async () => {
  // chainer (easy mode)
  const value = await Convert(AMOUNT).from("USD").to(QUOTE);

  await expectRealConversion(value, { amount: AMOUNT, from: "USD" });
}, 20000);

test("Fetches raw rates for given currency.", async () => {
  const conv = await Convert().from("USD").fetch();

  // reasonable expectation for rate amount
  expect(Object.keys(conv.rates).length).toBeGreaterThan(5);
}, 20000);

test("Converts (chained) an amount of given currency (cached).", async () => {
  const conv = await Convert().from("USD").fetch();

  const value = await conv.amount(AMOUNT).to(QUOTE);

  // The cached path must produce the same rate as the uncached one, not merely
  // some number: it reuses a rate table fetched earlier in the chain.
  await expectRealConversion(value, { amount: AMOUNT, from: "USD" });
}, 20000);
