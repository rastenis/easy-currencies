import { mockClient, response } from "../helpers/mockClient";
import { Provider } from "../../src/parts/providers";

/**
 * `providers` in src/parts/providers.ts is a mutable module singleton, and
 * resolveProvider both mutates it and returns the shared object, so Converter
 * instances share provider state.
 *
 * These tests assert current, wrong behaviour. When one fails, the bug is fixed
 * and the test should be inverted to assert isolation.
 */

function load() {
  let mod: any;
  jest.isolateModules(() => {
    mod = require("../../src/converter");
  });
  return mod.Converter;
}

function customProvider(): Provider {
  return {
    endpoint: { base: "https://custom.example.com/", single: "%FROM%-%TO%", multiple: "" },
    key: "ck",
    handler: (data: any) => data.rates,
    errors: {},
    errorHandler: () => null
  };
}

it("lets a second converter overwrite the first one's API key", async () => {
  const Converter = load();
  const first = new Converter("Fixer", "KEY_ONE");
  new Converter("Fixer", "KEY_TWO");

  const mock = mockClient(response({ rates: { EUR: 0.9 } }));
  first.config.setClient(mock.client);

  await first.convert(15, "USD", "EUR");

  // The first converter sends the second converter's credentials.
  expect(mock.url()).toContain("KEY_TWO");
  expect(mock.url()).not.toContain("KEY_ONE");
});

it("refuses a provider name already registered by an unrelated instance", () => {
  const Converter = load();
  const a = new Converter();
  a.add("SharedName", customProvider());

  const b = new Converter();

  expect(() => b.add("SharedName", customProvider())).toThrow();
});
