const { Converter, Convert } = require("../dist");
const to = require("await-to-js").default;

test("Conversion error: Unhandled", async () => {
  // default initialization
  let converter = new Converter();

  // defining provider with unhandled errors
  let newProvider = {
    endpoint: {
      base: "http://apilayer.net/api/live?access_key=%KEY%",
      single: "&source=%FROM%",
      multiple: "&source=%FROM%&currencies=%TO%"
    },
    key: "none", // no key
    handler: function(data) {
      return data;
    },
    errors: {
      105: "A paid plan is required in order to use CurrencyLayer (base currency use not allowed)",
      // 101: "Invalid API key!",
      201: "Invalid base currency."
    },
    errorHandler: function(data) {
      return data.error ? data.error.code : null;
    }
  };

  converter.add("MyProvider", newProvider, true);

  let [err, value] = await to(converter.convert(15, "USD", "EUR"));
  expect(err).toBe(101); // unhandled error expected
});
