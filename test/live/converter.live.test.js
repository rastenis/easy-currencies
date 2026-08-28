const { Converter } = require("../../src");
const { expectRealConversion, QUOTE } = require("./helpers/liveRate");

const AMOUNT = 15;

test("Converts an amount of given currency.", async () => {
  // default initialization
  const converter = new Converter();

  const value = await converter.convert(AMOUNT, "USD", QUOTE);

  await expectRealConversion(value, { amount: AMOUNT, from: "USD" });
}, 20000);

test("Get rates with respect to given currency (single).", async () => {
  // default initialization
  const converter = new Converter();

  const rates = await converter.getRates("USD", "EUR");

  expect(Object.keys(rates).length).toBeGreaterThanOrEqual(1); // some default providers just return all currencies.
}, 20000);

test("Get rates with respect to given currency (multiple).", async () => {
  // default initialization
  const converter = new Converter();

  const rates = await converter.getRates("USD", "", true);

  // reasonable expectation for amount of rates
  expect(Object.keys(rates).length).toBeGreaterThan(5);
}, 20000);
