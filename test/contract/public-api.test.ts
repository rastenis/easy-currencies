import { existsSync } from "fs";
import { join } from "path";

/**
 * Runtime companion to etc/easy-currencies.api.md.
 *
 * The report pins types. It cannot see two things: which exports survive to
 * runtime (a value export downgraded to `export type` vanishes silently), and
 * the provider name strings callers pass to `new Converter(name, key)` — those
 * are public API that no type mentions.
 *
 * Runs against dist/, since that is what ships.
 */

const DIST = join(__dirname, "../../dist");

if (!existsSync(join(DIST, "index.js"))) {
  throw new Error("dist/ is missing — run `npm run build` before the tests.");
}

/** `providers` is a mutable singleton and the constructor writes keys into it. */
function freshPkg(): any {
  let pkg: any;
  jest.isolateModules(() => {
    pkg = require(DIST);
  });
  return pkg;
}

describe("published entry point", () => {
  it("exports exactly the documented runtime surface", () => {
    expect(Object.keys(freshPkg()).sort()).toEqual([
      "Convert",
      "Converter",
      "RATES_BASE_KEY",
      "createClient",
      "providers"
    ]);
  });

  it("exposes Convert as a chainable factory", () => {
    const chain = freshPkg().Convert(1);

    expect(["from", "to", "fetch", "amount"].map((m) => typeof chain[m])).toEqual([
      "function",
      "function",
      "function",
      "function"
    ]);
  });
});

describe("provider names", () => {
  // Callers pass these as strings, so renaming one is a breaking change that
  // no type signature — and therefore no API report — can catch.
  const NAMES = [
    "AlphaVantage",
    "CurrencyLayer",
    "ExchangeRateAPI",
    "ExchangeRatesAPIIO",
    "Fixer",
    "FloatRates",
    "Frankfurter",
    "OpenExchangeRates"
  ];

  it("registers exactly the documented providers", () => {
    expect(Object.keys(freshPkg().providers).sort()).toEqual(NAMES);
  });

  it.each(NAMES)("%s is constructible by name", (name) => {
    // Only that the name still resolves: what the resulting provider does with
    // a response is the contract suite's job, and its endpoint is pinned by the
    // contract fixtures.
    expect(() => new (freshPkg().Converter)(name, "k")).not.toThrow();
  });
});
