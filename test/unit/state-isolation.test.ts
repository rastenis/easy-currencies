import { mockClient, response } from "../helpers/mockClient";
import { Converter } from "../../src/converter";
import { Provider } from "../../src/parts/providers";

/**
 * Instance isolation.
 *
 * `providers` in src/parts/providers.ts is a mutable module-level singleton,
 * and `resolveProvider` both mutates it and hands back the shared object. Two
 * Converter instances therefore share provider state.
 *
 * The `it.failing` cases below describe how the library *should* behave. They
 * pass while the bug is present and start failing the moment it is fixed — at
 * which point drop the `.failing` and they become ordinary regression tests.
 */

function customProvider(): Provider {
  return {
    endpoint: { base: "https://custom.example.com/", single: "%FROM%-%TO%", multiple: "" },
    key: "ck",
    handler: (data: any) => data.rates,
    errors: {},
    errorHandler: () => null
  };
}

describe("API key isolation between instances", () => {
  it.failing(
    "keeps each converter's API key when two use the same provider",
    async () => {
      const first = new Converter("Fixer", "KEY_ONE");
      // Creating the second converter reassigns `key` on the shared Fixer object.
      new Converter("Fixer", "KEY_TWO");

      const mock = mockClient(response({ rates: { EUR: 0.9 } }));
      first.config.setClient(mock.client);

      await first.convert(15, "USD", "EUR");

      expect(mock.url()).toContain("KEY_ONE");
    }
  );

  it("documents the current leak: the last key set wins for every instance", async () => {
    const first = new Converter("Fixer", "KEY_ONE");
    new Converter("Fixer", "KEY_TWO");

    const mock = mockClient(response({ rates: { EUR: 0.9 } }));
    first.config.setClient(mock.client);

    await first.convert(15, "USD", "EUR");

    // The first converter silently sends the second converter's credentials.
    expect(mock.url()).toContain("KEY_TWO");
  });
});

describe("user-defined provider registration", () => {
  it.failing(
    "lets two converters each register a provider under the same name",
    () => {
      const a = new Converter();
      a.add("MyProvider", customProvider());

      const b = new Converter();
      expect(() => b.add("MyProvider", customProvider())).not.toThrow();
    }
  );

  it("documents the current leak: registration is global and one-shot", () => {
    const a = new Converter();
    a.add("SharedName", customProvider());

    const b = new Converter();
    // Registration went into the module-level map, so an unrelated instance
    // is refused.
    expect(() => b.add("SharedName", customProvider())).toThrow();
  });
});
