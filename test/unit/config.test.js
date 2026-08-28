const { providers, Converter } = require("../../src");

test("Provider operations: Initializing and getting active.", async () => {
  // default initialization
  const converter = new Converter("CurrencyLayer", "key");

  const value = converter.providers;

  // one configured provider + the three implicit keyless fallbacks
  expect(value.length).toEqual(4);

  // expect given provider
  expect(value[0].endpoint.base).toBe(
    "https://apilayer.net/api/live?access_key=%KEY%"
  );
  expect(value[0].key).toBe("key");

  // second getter
  expect(converter.providers).toEqual(converter.active);
});

test("Provider operations: Initializing via ProviderReference", async () => {
  // default initialization
  const converter = new Converter({ name: "CurrencyLayer", key: "key" });

  const value = converter.providers;

  // one configured provider + the three implicit keyless fallbacks
  expect(value.length).toEqual(4);

  // expect given provider
  expect(value[0].endpoint.base).toBe(
    "https://apilayer.net/api/live?access_key=%KEY%"
  );
  expect(value[0].key).toBe("key");

  // second getter
  expect(converter.providers).toEqual(converter.active);
});

test("Provider operations: Adding provider - active.", async () => {
  // default initialization
  const converter = new Converter("CurrencyLayer", "key");

  const newProvider = {
    endpoint: {
      base: "base",
      single: "single",
      multiple: "multiple"
    },
    key: null,
    handler: function (data) {
      return data.rates;
    },
    errors: { 400: "Malformed query." },
    errorHandler: function (data) {
      return data.status;
    }
  };

  converter.add("MyProvider", newProvider, true);

  const value = converter.providers;

  expect(value.length).toEqual(5);

  // expect given provider (with SetActive)
  expect(value[0]).toEqual(newProvider);

  // expect the provider to be registered in the register map
  expect(providers["MyProvider"]).toBeDefined();
  expect(providers["MyProvider"]).toEqual(newProvider);
});

test("Provider operations: Adding provider - inactive.", async () => {
  // default initialization
  const converter = new Converter("CurrencyLayer", "key");

  const newProvider = {
    endpoint: {
      base: "base",
      single: "single",
      multiple: "multiple"
    },
    key: null,
    handler: function (data) {
      return data.rates;
    },
    errors: { 400: "Malformed query." },
    errorHandler: function (data) {
      return data.status;
    }
  };

  converter.add("MyProvider5", newProvider);

  const value = converter.providers;

  expect(value.length).toEqual(5);

  // appended after the implicit fallbacks
  expect(value[value.length - 1]).toEqual(newProvider);

  // expect the provider to be registered in the register map
  expect(providers["MyProvider5"]).toBeDefined();
  expect(providers["MyProvider5"]).toEqual(newProvider);
});

test("Provider operations: Adding multiple providers.", async () => {
  // default initialization
  const converter = new Converter("CurrencyLayer", "key");

  const newProvider1 = {
      endpoint: {
        base: "base1",
        single: "single1",
        multiple: "multiple1"
      },
      key: null,
      handler: function (data) {
        return data.rates;
      },
      errors: { 400: "Malformed query." },
      errorHandler: function (data) {
        return data.status;
      }
    },
    newProvider2 = {
      endpoint: {
        base: "base2",
        single: "single2",
        multiple: "multiple2"
      },
      key: null,
      handler: function (data) {
        return data.rates;
      },
      errors: { 400: "Malformed query." },
      errorHandler: function (data) {
        return data.status;
      }
    };

  converter.addMultiple([
    { name: "MyProvider1", provider: newProvider1 },
    { name: "MyProvider2", provider: newProvider2 }
  ]);

  const value = converter.providers;

  expect(value.length).toEqual(6);

  // expect given provider (with SetActive)
  expect(value[value.length - 2]).toEqual(newProvider1);
  expect(value[value.length - 1]).toEqual(newProvider2);

  // expect the provider to be registered in the register map
  expect(providers["MyProvider1"]).toBeDefined();
  expect(providers["MyProvider1"]).toEqual(newProvider1);
  expect(providers["MyProvider2"]).toBeDefined();
  expect(providers["MyProvider2"]).toEqual(newProvider2);
});

test("Client operations: replace the HTTP client.", async () => {
  const converter = new Converter("CurrencyLayer", "key");
  const client = { get: async () => ({ status: 200, data: {} }) };

  converter.setClient(client);

  expect(converter.config.getClient()).toBe(client);
});

test("Client operations: the replacement client is the one used.", async () => {
  const converter = new Converter("ExchangeRateAPI");
  const urls = [];
  converter.setClient({
    get: async (url) => {
      urls.push(url);
      return { status: 200, data: { rates: { EUR: 0.9 } } };
    }
  });

  const value = await converter.convert(15, "USD", "EUR");

  expect(value).toBeCloseTo(13.5, 10);
  expect(urls).toHaveLength(1);
});
