const { Converter, Convert } = require("../dist");
const to = require("await-to-js").default;

test("Conversion error: Unhandled", async () => {
  // default initialization
  const converter = new Converter();

  // defining provider with unhandled errors
  const newProvider = {
    endpoint: {
      base: "http://apilayer.net/api/live?access_key=%KEY%",
      single: "&source=%FROM%",
      multiple: "&source=%FROM%&currencies=%TO%"
    },
    key: "none", // no key
    handler: function (data) {
      return data;
    },
    errors: {
      105: "A paid plan is required in order to use CurrencyLayer (base currency use not allowed)",
      // 101: "Invalid API key!",
      201: "Invalid base currency."
    },
    errorHandler: function (data) {
      return data.error ? data.error.code : null;
    }
  };

  converter.add("MyProvider", newProvider, true);

  const [err, value] = await to(converter.convert(15, "USD", "EUR"));
  expect(err).toBe(101); // unhandled error expected
});

test("Conversion error: Unhandled rates issue", async () => {
  // default initialization
  const converter = new Converter();

  // defining provider with unhandled errors
  const newProvider = {
    endpoint: {
      base: "https://baconipsum.com/api/?type=meat-and-filler",
      single: "",
      multiple: ""
    },
    key: "",
    handler: function (data) {
      return "Sample false response";
    },
    errors: {},
    errorHandler: function (data) {
      return data.error ? data.error.code : null;
    }
  };

  converter.add("MyProvider1", newProvider, true);

  const [err, value] = await to(converter.convert(15, "USD", "EUR"));
  expect(err.message).toBe("No 'EUR' present in rates: Sample false response"); // unhandled error expected
});
