import { Converter } from "../../src/converter";
import { providers, resolveProvider } from "../../src/parts/providers";

/**
 * The provider registry is looked up by a caller-supplied string. Before this
 * was guarded, `new Converter("__proto__", key)` wrote the API key onto
 * Object.prototype, where every object in the process could read it.
 */

describe("registry lookup", () => {
  it.each(["__proto__", "constructor", "prototype", "toString", "valueOf", "hasOwnProperty"])(
    "rejects the inherited name %s",
    (name) => {
      expect(() => new Converter(name, "SECRET")).toThrow(/No provider with this name/);
    }
  );

  it("does not write the key onto Object.prototype", () => {
    try {
      new Converter("__proto__", "SECRET");
    } catch {
      /* expected */
    }

    expect(({} as any).key).toBeUndefined();
    expect(([] as any).key).toBeUndefined();
    expect((JSON.parse("{}") as any).key).toBeUndefined();
  });

  it.each([null, undefined, 42, {}])("rejects the non-string name %p", (name) => {
    expect(() => resolveProvider({ name: name as any, key: "k" })).toThrow();
  });
});

describe("instance isolation", () => {
  it("gives each converter its own provider object", () => {
    const a = new Converter("Fixer", "KEY_ONE");
    const b = new Converter("Fixer", "KEY_TWO");

    expect(a.active[0]).not.toBe(b.active[0]);
    expect(a.active[0].key).toBe("KEY_ONE");
    expect(b.active[0].key).toBe("KEY_TWO");
  });

  it("never writes a key into the exported registry", () => {
    new Converter("Fixer", "LEAKED");

    // `providers` is public, so a key here is readable by anything in the process.
    expect(providers.Fixer.key).toBeUndefined();
  });

  it("still de-duplicates the auto-inserted fallback", () => {
    // Copies broke identity-based de-duplication; the endpoint identifies a
    // duplicate instead.
    // Three keyless providers are added implicitly; naming one must not
    // duplicate it.
    expect(new Converter().providers).toHaveLength(3);
    expect(new Converter("ExchangeRateAPI").providers).toHaveLength(3);
    expect(new Converter("Frankfurter").providers).toHaveLength(3);
    expect(new Converter("Fixer", "k").providers).toHaveLength(4);
  });
});

describe("built-in templates", () => {
  it("are frozen", () => {
    expect(Object.isFrozen(providers.Fixer)).toBe(true);
    expect(Object.isFrozen(providers.Fixer.endpoint)).toBe(true);
    expect(Object.isFrozen(providers.Fixer.errors)).toBe(true);
  });

  it("send API keys over https", () => {
    for (const name of Object.keys(providers)) {
      expect(providers[name].endpoint.base).not.toMatch(/^http:/);
    }
  });
});

describe("configuration guards", () => {
  it.each([undefined, null])("falls back to the default provider for %p", (config) => {
    expect(new Converter(config as any).providers).toHaveLength(3);
  });

  it("rejects a non-array batch", () => {
    expect(() => new Converter().addMultiple(null as any)).toThrow(/array/);
  });

  it("registers nothing when one entry in a batch is invalid", () => {
    const good = {
      name: "BatchGood",
      provider: {
        endpoint: { base: "https://a/", single: "%FROM%", multiple: "" },
        key: "k",
        handler: (d: any) => d.rates,
        errors: {},
        errorHandler: () => null
      }
    };

    expect(() =>
      new Converter().addMultiple([good, { name: "BatchBad" } as any])
    ).toThrow(/Invalid provider format/);

    // A partial registration would make every retry fail with "already registered".
    expect(Object.prototype.hasOwnProperty.call(providers, "BatchGood")).toBe(false);
  });
});
