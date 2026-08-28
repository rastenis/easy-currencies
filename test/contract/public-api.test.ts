import { existsSync } from "fs";
import { join } from "path";

/**
 * Runtime companion to etc/easy-currencies.api.md, which covers types only.
 * This pins what the published package actually exports, and the provider name
 * strings callers pass to `new Converter(name, key)` — those names are public
 * API even though no type mentions them.
 *
 * Runs against dist/, since that is what ships.
 */

const DIST = join(__dirname, "../../dist");

if (!existsSync(join(DIST, "index.js"))) {
  throw new Error("dist/ is missing — run `npm run build` before the tests.");
}

const pkg = require(DIST);

describe("published entry point", () => {
  it("exports exactly the documented surface", () => {
    expect(Object.keys(pkg).sort()).toEqual(["Convert", "Converter", "providers"]);
  });

  it("exposes Converter as a constructor", () => {
    expect(typeof pkg.Converter).toBe("function");
    expect(new pkg.Converter()).toBeInstanceOf(pkg.Converter);
  });

  it("exposes Convert as a chainable factory", () => {
    expect(typeof pkg.Convert).toBe("function");

    const chain = pkg.Convert(1);
    expect(typeof chain.from).toBe("function");
    expect(typeof chain.to).toBe("function");
    expect(typeof chain.fetch).toBe("function");
    expect(typeof chain.amount).toBe("function");
  });
});

describe("provider names", () => {
  // Callers pass these as strings, so renaming one is a breaking change.
  const NAMES = [
    "AlphaVantage",
    "CurrencyLayer",
    "ExchangeRateAPI",
    "ExchangeRatesAPIIO",
    "Fixer",
    "OpenExchangeRates"
  ];

  it("registers exactly the documented providers", () => {
    expect(Object.keys(pkg.providers).sort()).toEqual(NAMES);
  });

  it.each(NAMES)("%s is constructible by name", (name) => {
    const converter = new pkg.Converter(name, "k");

    expect(converter.active[0].endpoint.base).toEqual(expect.any(String));
  });
});

describe("Converter instance surface", () => {
  const METHODS = [
    "add",
    "addMultiple",
    "addMultipleProviders",
    "addProvider",
    "convert",
    "convertRate",
    "getRates",
    "remove",
    "setProxyConfiguration"
  ];

  it.each(METHODS)("exposes %s", (method) => {
    expect(typeof (new pkg.Converter() as any)[method]).toBe("function");
  });

  it("exposes the providers and active getters", () => {
    const converter = new pkg.Converter();

    expect(Array.isArray(converter.providers)).toBe(true);
    expect(Array.isArray(converter.active)).toBe(true);
  });
});
