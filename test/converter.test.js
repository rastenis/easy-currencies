const { Converter } = require("../dist");

test("Converts an amount of given currency.", async () => {
  // default initialization
  let converter = new Converter();

  let value = await converter.convert(15, "USD", "EUR");

  expect(typeof value).toBe("number");
  expect(value).toBeGreaterThan(0);
  expect(value).toBeLessThan(30);
});

test("Get rates with respect to given currency (single).", async () => {
  // default initialization
  let converter = new Converter();

  let rates = await converter.getRates("USD", "EUR", false);

  expect(Object.keys(rates).length).toBe(1);
});

test("Get rates with respect to given currency (multiple).", async () => {
  // default initialization
  let converter = new Converter();

  let rates = await converter.getRates("USD", "", true);

  // reasonable expectation for amount of rates
  expect(Object.keys(rates).length).toBeGreaterThan(5);
});
