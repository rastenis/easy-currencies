const { Converter } = require("../dist");

test("Initializes providers properly (no provider).", async () => {
  // default initialization
  let converter = new Converter();

  let value = converter.providers;

  // expect default provider
  expect(value[0].endpoint.base).toBe("https://api.exchangeratesapi.io/latest");
});

test("Initializes providers properly (single provider).", async () => {
  // default initialization
  let converter = new Converter("CurrencyLayer", "key");

  let value = converter.providers;

  // expect given provider
  expect(value[0].endpoint.base).toBe(
    "https://apilayer.net/api/live?access_key=%KEY%"
  );
  expect(value[0].key).toBe("key");
});

test("Initializes providers properly (multiple providers).", async () => {
  // default initialization
  let converter = new Converter(
    { name: "CurrencyLayer", key: "key" },
    { name: "OpenExchangeRates", key: "key" }
  );

  let value = converter.providers;

  // expect multiple providers
  expect(value[0].endpoint.base).toBe(
    "https://apilayer.net/api/live?access_key=%KEY%"
  );
  expect(value[0].key).toBe("key");
  expect(value[1].endpoint.base).toBe(
    "https://openexchangerates.org/api/latest.json?app_id=%KEY%"
  );
  expect(value[1].key).toBe("key");
});
