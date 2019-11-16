const { Converter } = require("../dist");
const to = require("await-to-js").default;

/**
 * Invalid api key failures
 */
// test("Fails because of invalid key (CurrencyLayer)", async () => {
//   let converter = new Converter("CurrencyLayer", "invalid");

//   let [err, value] = await to(converter.convert(15, "CNY", "EUR"));

//   expect(err).toBeTruthy();
// });

// AlphaVantage key checking is incorrect at the moment.
// test("Fails because of invalid key (AlphaVantage)", async () => {
//   let converter = new Converter("AlphaVantage", "");

//   let [err, value] = await to(converter.convert(15, "CNY", "EUR"));

//   expect(err).toBeTruthy();
// });
