import { mockClient, response } from "../helpers/mockClient";
import { Provider } from "../../src/parts/providers";

/**
 * `providers` in src/parts/providers.ts is a mutable module singleton, and
 * resolveProvider both mutates it and returns the shared object, so Converter
 * instances share provider state.
 *
 * Instances must not share provider state: resolveProvider copies the template
 * rather than handing back the shared object.
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
    endpoint: { base: "https://custom.example.com/", single: "%FROM%-%TO%" },
    key: "ck",
    handler: (data: any) => data.rates,
    errors: {},
    errorHandler: () => null
  };
}

it("keeps each converter's API key when two use the same provider", async () => {
  const Converter = load();
  const first = new Converter("Fixer", "KEY_ONE");
  new Converter("Fixer", "KEY_TWO");

  const mock = mockClient(response({ rates: { EUR: 0.9 } }));
  first.config.setClient(mock.client);

  await first.convert(15, "USD", "EUR");

  expect(mock.url()).toContain("KEY_ONE");
  expect(mock.url()).not.toContain("KEY_TWO");
});

it("refuses a provider name already registered by an unrelated instance", () => {
  const Converter = load();
  const a = new Converter();
  a.add("SharedName", customProvider());

  const b = new Converter();

  expect(() => b.add("SharedName", customProvider())).toThrow();
});
