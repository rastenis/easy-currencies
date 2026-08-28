import { Converter } from "../../src/converter";
import { HttpClient } from "../../src/parts/client";
import { Provider, providers } from "../../src/parts/providers";

/**
 * Construction and provider-ordering behaviour that no other suite reaches.
 *
 * The contract suite pins what each provider does with a response; this file
 * pins how a Converter is built and how its fallback chain is ordered. Endpoint
 * strings are compared against the registry rather than restated, so a URL
 * change is caught once, in the contract fixtures, and not again here.
 */

/** `add` registers into the module-global registry, so every name here is unique. */
const customProvider = (base: string): Provider => ({
  endpoint: { base, single: "%FROM%" },
  key: null,
  handler: (data: any) => data.rates,
  errors: { 400: "Malformed query." },
  errorHandler: (data: any) => data.status
});

describe("construction", () => {
  it("accepts a name and key as positional arguments", () => {
    const converter = new Converter("CurrencyLayer", "key");

    expect(converter.providers[0].endpoint).toEqual(
      providers.CurrencyLayer.endpoint
    );
    expect(converter.providers[0].key).toBe("key");
  });

  // `new Converter({ name, key })` is a documented public form; the positional
  // one above goes down a different branch of resolveProviders.
  it("accepts a ProviderReference object", () => {
    const converter = new Converter({ name: "CurrencyLayer", key: "key" });

    expect(converter.providers[0].endpoint).toEqual(
      providers.CurrencyLayer.endpoint
    );
    expect(converter.providers[0].key).toBe("key");
  });

  it("accepts several ProviderReferences, keeping their order and keys", () => {
    const converter = new Converter(
      { name: "CurrencyLayer", key: "first" },
      { name: "OpenExchangeRates", key: "second" }
    );

    expect(converter.providers.slice(0, 2).map((p) => p.endpoint)).toEqual([
      providers.CurrencyLayer.endpoint,
      providers.OpenExchangeRates.endpoint
    ]);
    expect(converter.providers.slice(0, 2).map((p) => p.key)).toEqual([
      "first",
      "second"
    ]);
  });

  it("names the supported-providers list when the name is unknown", () => {
    expect(() => new Converter("NoSuchProvider")).toThrow(
      "No provider with this name. Please use a provider from the supported providers list."
    );
  });

  // A number is neither a name nor a config object; the message has to say so
  // rather than crashing somewhere inside resolveProvider.
  it("rejects a config that is neither a string nor an object", () => {
    expect(() => new Converter(12 as any)).toThrow(
      "You must either supply nothing or a config object (see the 'config' section to see the different APIs that can be used)"
    );
  });
});

describe("provider ordering", () => {
  it("prepends a provider added with setActive", () => {
    const converter = new Converter("CurrencyLayer", "key");
    const provider = customProvider("https://prepended.example/");

    converter.add("OrderingPrepend", provider, true);

    expect(converter.providers[0]).toBe(provider);
  });

  it("appends a provider added without setActive", () => {
    const converter = new Converter("CurrencyLayer", "key");
    const provider = customProvider("https://appended.example/");

    converter.add("OrderingAppend", provider);

    expect(converter.providers[converter.providers.length - 1]).toBe(provider);
  });

  // Public API that the Converter itself no longer calls — it snapshots the
  // whole chain per request — so nothing else would notice it breaking.
  it("reports the head of the chain as the active provider", () => {
    const converter = new Converter("CurrencyLayer", "key");
    const provider = customProvider("https://active.example/");

    expect(converter.config.activeProvider()).toBe(converter.providers[0]);

    converter.add("OrderingActive", provider, true);

    expect(converter.config.activeProvider()).toBe(provider);
  });
});

describe("client replacement", () => {
  it("hands back the client it was given", () => {
    const converter = new Converter("CurrencyLayer", "key");
    const client: HttpClient = { get: async () => ({ status: 200, data: {} }) };

    converter.setClient(client);

    expect(converter.config.getClient()).toBe(client);
  });
});
