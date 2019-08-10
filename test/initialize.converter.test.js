const { Converter } = require("../dist");

test("Initializes providers properly (no provider).", async () => {
  // default initialization
  let converter = new Converter();

  let value = converter.providers;

  // expect default provider
  expect(value[0].endpoint.base).toBe("https://api.exchangeratesapi.io/latest");
  // second getter
  expect(converter.providers).toEqual(converter.active);
});

test("Initializes providers properly (single provider).", async () => {
  // default initialization
  let converter = new Converter("CurrencyLayer", "key");

  let value = converter.providers;

  // expect given provider
  expect(value[0].endpoint.base).toBe(
    "http://apilayer.net/api/live?access_key=%KEY%"
  );
  expect(value[0].key).toBe("key");
  // second getter
  expect(converter.providers).toEqual(converter.active);
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
    "http://apilayer.net/api/live?access_key=%KEY%"
  );
  expect(value[0].key).toBe("key");
  expect(value[1].endpoint.base).toBe(
    "https://openexchangerates.org/api/latest.json?app_id=%KEY%"
  );
  expect(value[1].key).toBe("key");
  // second getter
  expect(converter.providers).toEqual(converter.active);
});

test("Fails to initialize properly (invalid provider).", async () => {
  // default initialization
  let error = null;
  try {
    let converter = new Converter("MyProvider");
  } catch (e) {
    error = e;
  }

  expect(error).toBe(
    "No provider with this name. Please use a provider from the supported providers list."
  );
});

test("Fails to initialize properly (invalid provider object).", async () => {
  // default initialization
  let error = null;
  try {
    let converter = new Converter(12);
  } catch (e) {
    error = e;
  }

  expect(error).toBe(
    "You must either supply nothing or a config object (see the 'config' section to see the different APIs that can be used)"
  );
});
