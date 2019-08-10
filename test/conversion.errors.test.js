const { Converter } = require("../dist");
const to = require("await-to-js").default;
require("dotenv").config();

/**
 * Invalid currencies
 */
test("Fails because of invalid key (CurrencyLayer)", async () => {
  let converter = new Converter("CurrencyLayer", "invalid");

  let [err, value] = await to(converter.convert(15, "CNYC", "EUR"));

  expect(err).toBeTruthy();
});

test("Fails because of invalid key (Fixer)", async () => {
  let converter = new Converter("Fixer", "invalid");

  let [err, value] = await to(converter.convert(15, "CNYC", "EUR"));

  expect(err).toBeTruthy();
});
