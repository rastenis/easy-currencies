const { Converter } = require("../dist");
const to = require("await-to-js").default;

test("Converts an amount of given currency.", async () => {
  // default initialization
  const converter = new Converter();

  const value = await converter.convert(15, "USD", "EUR");

  expect(typeof value).toBe("number");
  expect(value).toBeGreaterThan(0);
  expect(value).toBeLessThan(30);
});

test("Get rates with respect to given currency (single).", async () => {
  // default initialization
  const converter = new Converter();

  const rates = await converter.getRates("USD", "EUR");

  expect(Object.keys(rates).length).toBeGreaterThanOrEqual(1); // some default providers just return all currencies.
});

test("Get rates with respect to given currency (multiple).", async () => {
  // default initialization
  const converter = new Converter();

  const rates = await converter.getRates("USD", "", true);

  // reasonable expectation for amount of rates
  expect(Object.keys(rates).length).toBeGreaterThan(5);
});

test("Throws on empty rate object.", async () => {
  const converter = new Converter();

  // Setting up a scenario where provider returns empty data object:
  const newProvider = {
    endpoint: {
      base: "https://api.exchangeratesapi.io/latest",
      single: "?base=%FROM%&symbols=%TO%",
      multiple: "?base=%FROM%"
    },
    key: null,
    handler: function (data) {
      return {};
    },
    errors: {},
    errorHandler: function (data) {
      return data.status;
    }
  };

  converter.add("MyProvider", newProvider, true);

  const [err, value] = await to(converter.convert(15, "USD", "EUR"));

  console.log(err, value);

  expect(err.message).toBe("No data returned for rate fetch.");
});
