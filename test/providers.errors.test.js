const { Converter } = require("../dist");
require("dotenv").config();

/**
 *  CurrencyLayer and Fixer
 */
test("Fails because of insufficient key level (CurrencyLayer)", async () => {
  // default initialization
  let converter = new Converter(
      "CurrencyLayer",
      process.env.CURRENCY_LAYER_KEY
    ),
    error = null;

  try {
    let value = await converter.convert(15, "USD", "EUR");
  } catch (e) {
    error = e;
  }

  expect(error).toBeTruthy();
});

test("Fails because of insufficient key level (Fixer)", async () => {
  // default initialization
  let converter = new Converter("Fixer", process.env.FIXER_KEY),
    error = null;

  try {
    let value = await converter.convert(15, "USD", "EUR");
  } catch (e) {
    error = e;
  }

  expect(error).toBeTruthy();
});
