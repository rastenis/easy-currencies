import { mockClient, response, httpError } from "../helpers/mockClient";
import { Converter, RATES_BASE } from "../../src/converter";
import { providers } from "../../src/parts/providers";

/**
 * Paths a provider or a client can take that the suite reached only by proxy.
 * Mutation testing showed each of these could be deleted outright with every
 * other test still green.
 */

function providerThat(overrides: any) {
  return {
    endpoint: { base: "https://x.example/", single: "%FROM%" },
    key: "k",
    handler: (d: any) => d.rates,
    errors: {},
    errorHandler: () => null,
    ...overrides
  };
}

/** A converter with the given provider first and one healthy provider behind it. */
function withBackup(provider: any, ...outcomes: any[]) {
  const converter = new Converter();
  converter.onError = () => {};
  converter.add("Probe", provider, true);
  const mock = mockClient(...outcomes);
  converter.config.setClient(mock.client);
  return { converter, mock };
}

describe("a throwing provider callback is that provider's failure", () => {
  it("falls back when handler throws", async () => {
    const { converter, mock } = withBackup(
      providerThat({
        handler: () => {
          throw new TypeError("handler exploded");
        }
      }),
      response({ rates: { EUR: 0.9 } })
    );

    await expect(converter.convert(10, "USD", "EUR")).resolves.toBeCloseTo(9, 10);
    expect(mock.urls().length).toBeGreaterThan(1);
  });

  it("falls back when errorHandler throws", async () => {
    const { converter, mock } = withBackup(
      providerThat({
        errorHandler: () => {
          throw new TypeError("errorHandler exploded");
        }
      }),
      response({ rates: { EUR: 0.9 } })
    );

    await expect(converter.convert(10, "USD", "EUR")).resolves.toBeCloseTo(9, 10);
    expect(mock.urls().length).toBeGreaterThan(1);
  });

  it("reports a non-Error thrown by a callback without leaking it raw", async () => {
    const converter = new Converter();
    const seen: unknown[] = [];
    converter.onError = (e) => seen.push(e);
    converter.add(
      "Probe",
      providerThat({
        errorHandler: () => {
          throw "a bare string";
        }
      }),
      true
    );
    converter.config.setClient(mockClient(response({ rates: { EUR: 0.9 } })).client);

    await converter.convert(10, "USD", "EUR");

    expect(String(seen[0])).toMatch(/Provider callback failed: a bare string/);
  });

  it("reports a handler that returns something unusable", async () => {
    const { converter } = withBackup(
      providerThat({ handler: () => "not a rate table" }),
      response({ rates: { EUR: 0.9 } })
    );

    const seen: unknown[] = [];
    converter.onError = (e) => seen.push(e);

    await converter.convert(10, "USD", "EUR");

    expect(String(seen[0])).toMatch(/no usable rates/);
  });

  it("calls onError for a readRates failure, not only a request failure", async () => {
    const converter = new Converter();
    const seen: unknown[] = [];
    converter.onError = (e) => seen.push(e);
    converter.add("Probe", providerThat({ handler: () => undefined }), true);
    converter.config.setClient(mockClient(response({ rates: { EUR: 0.9 } })).client);

    await converter.convert(10, "USD", "EUR");

    expect(seen).toHaveLength(1);
  });
});

describe("the base marker is stamped on fetched rates", () => {
  it("carries the base it was fetched for", async () => {
    const converter = new Converter();
    converter.config.setClient(mockClient(response({ rates: { EUR: 0.9 } })).client);

    const rates: any = await converter.getRates("USD", "", true);

    expect(rates[RATES_BASE]).toBe("USD");
  });

  it("rejects those rates for a different base", async () => {
    const converter = new Converter();
    converter.config.setClient(mockClient(response({ rates: { EUR: 0.9 } })).client);
    const rates = await converter.getRates("USD", "", true);

    await expect(converter.convert(1, "GBP", "EUR", rates)).rejects.toThrow(
      /fetched for base 'USD'/
    );
  });

  it("survives a round trip through a cache", async () => {
    const converter = new Converter();
    converter.config.setClient(mockClient(response({ rates: { EUR: 0.9, GBP: 0.8 } })).client);
    const rates = await converter.getRates("USD", "", true);

    // The symbol does not survive any of these; the enumerable key is the
    // reason a cached table still refuses the wrong base.
    for (const copy of [
      JSON.parse(JSON.stringify(rates)),
      { ...rates },
      Object.assign({}, rates)
    ]) {
      await expect(converter.convert(100, "GBP", "EUR", copy)).rejects.toThrow(
        /fetched for base 'USD'/
      );
    }
  });

  it("does not count the marker as a rate", async () => {
    const converter = new Converter();
    converter.config.setClient(mockClient(response({ rates: { EUR: 0.9 } })).client);
    const rates = await converter.getRates("USD", "", true);

    await expect(converter.convert(10, "USD", "CHF", rates)).rejects.toThrow(
      /No 'CHF' present in rates \(1 rate available\)/
    );
  });

  it("still converts a table built by hand, which carries no marker", async () => {
    await expect(
      new Converter().convert(10, "USD", "EUR", { EUR: 0.9 })
    ).resolves.toBeCloseTo(9, 10);
  });
});

describe("addMultiple validates its argument", () => {
  it("rejects a non-array", () => {
    expect(() => new Converter().addMultiple("nope" as any)).toThrow(/array/);
  });

  it("adds nothing when one entry in the batch is invalid", () => {
    const converter = new Converter();
    const before = converter.providers.length;

    expect(() =>
      converter.addMultiple([
        { name: "BatchOk", provider: providerThat({}) },
        { name: "BatchBad" } as any
      ])
    ).toThrow(/Invalid provider format/);

    // The comment promises atomicity; nothing asserted it.
    expect(converter.providers).toHaveLength(before);
  });
});

describe("whole-table fetches", () => {
  it("skip a provider whose template needs a target currency", async () => {
    const converter = new Converter({ name: "Fixer", key: "K" } as any);
    converter.onError = () => {};
    const mock = mockClient(response({ rates: { EUR: 0.9 } }));
    converter.config.setClient(mock.client);

    await converter.getRates("USD", "", true);

    // Fixer's template carries &symbols=%TO%, so a table request would go out
    // asking for an empty symbol list.
    expect(mock.urls().every((u) => !u.endsWith("symbols="))).toBe(true);
  });

  it("validate the target currency when one is given", async () => {
    await expect(new Converter().getRates("USD", "not a currency")).rejects.toThrow(
      /alphanumeric/
    );
  });
});

describe("registry hardening", () => {
  it("cannot delete a built-in or add a new entry", () => {
    // Sealed, so both operations throw under strict mode rather than silently
    // failing; either way the registry is unchanged.
    expect(() => delete (providers as any).Fixer).toThrow();
    expect(() => ((providers as any).Injected = {})).toThrow();

    expect(providers.Fixer.endpoint.base).toContain("fixer.io");
    expect((providers as any).Injected).toBeUndefined();
  });
});

describe("empty and unusable responses", () => {
  it("rejects an empty rate table", async () => {
    const converter = new Converter();
    converter.onError = () => {};
    converter.config.setClient(mockClient(response({ rates: {} })).client);

    await expect(converter.convert(1, "USD", "EUR")).rejects.toThrow();
  });

  it("falls back rather than returning an empty table as success", async () => {
    // The default chain is three providers. An empty table used to end the walk
    // here, so the healthy provider behind this one was never asked.
    const converter = new Converter();
    converter.onError = () => {};
    const mock = mockClient(
      response({ rates: {} }),
      response({ rates: { EUR: 0.9 } })
    );
    converter.config.setClient(mock.client);

    await expect(converter.getRates("USD", "", true)).resolves.toEqual({
      EUR: 0.9,
      __base: "USD"
    });
    expect(mock.urls().length).toBeGreaterThan(1);
  });

  it.each([
    ["a table whose only value is null", { undefined: null }],
    ["a table whose only value is NaN", { EUR: NaN }],
    ["a table of unparseable strings", { EUR: "unavailable" }],
    ["a table of non-positive rates", { EUR: 0, GBP: -1 }]
  ])("treats %s as that provider's failure", async (_label, rates) => {
    const converter = new Converter();
    const seen: unknown[] = [];
    converter.onError = (e) => seen.push(e);
    converter.add("Probe", providerThat({ handler: () => rates }), true);
    converter.config.setClient(mockClient(response({ rates: { EUR: 0.9 } })).client);

    // A junk 200 must not be fabricated into a rate table the caller trusts.
    await expect(converter.getRates("USD", "", true)).resolves.toEqual({
      EUR: 0.9,
      __base: "USD"
    });
    expect(String(seen[0])).toMatch(/no usable rates/);
  });

  it("fetches normally when rates are explicitly null", async () => {
    const converter = new Converter();
    converter.config.setClient(mockClient(response({ rates: { EUR: 0.9 } })).client);

    await expect(converter.convert(10, "USD", "EUR", null as any)).resolves.toBeCloseTo(
      9,
      10
    );
  });
});

describe("a vendor error maps the same whether it arrives by status or in a body", () => {
  /** Only the named provider, so the chain cannot mask the mapping under test. */
  function only(name: string, key: string) {
    const converter = new Converter(name, key);
    while (converter.active.length > 1) {
      converter.remove(converter.active[1]);
    }
    converter.onError = () => {};
    return converter;
  }

  // apilayer returns its codes in a 200 body most of the time and by status the
  // rest of it. Reading the response object meant data.error.code was undefined
  // on every HTTP failure, so these three tables were unreachable by status.
  it.each(["ExchangeRatesAPIIO", "CurrencyLayer", "Fixer"])(
    "%s maps code 101 carried by an HTTP 401",
    async (name) => {
      const converter = only(name, "KEY");
      converter.config.setClient(
        mockClient(httpError(401, { error: { code: 101 } })).client
      );

      await expect(converter.convert(15, "USD", "EUR")).rejects.toThrow(
        "Invalid API key!"
      );
    }
  );

  it("still maps a status for the providers whose table is keyed by one", async () => {
    const converter = only("OpenExchangeRates", "KEY");
    converter.config.setClient(mockClient(httpError(401)).client);

    await expect(converter.convert(15, "USD", "EUR")).rejects.toThrow(
      "Invalid API key!"
    );
  });

  it("leaves an unenumerated status to the transport message", async () => {
    const converter = only("Fixer", "KEY");
    converter.config.setClient(mockClient(httpError(500)).client);

    // Not a bare "500": the status is not a verdict the provider registered.
    await expect(converter.convert(15, "USD", "EUR")).rejects.toThrow(
      /HTTP 500/
    );
  });

  it("reports a 200 whose body did not parse", async () => {
    const converter = only("Fixer", "KEY");
    converter.config.setClient(mockClient(response(undefined)).client);

    // Used to reach the handler and surface as a bare TypeError.
    await expect(converter.convert(15, "USD", "EUR")).rejects.toThrow(
      /no readable body/
    );
  });
});
