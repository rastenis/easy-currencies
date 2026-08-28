import { mockClient, response, httpError, transportError } from "../helpers/mockClient";
import {
  PROVIDER_FIXTURES,
  ProviderFixture,
  AMOUNT,
  EXPECTED
} from "../fixtures/providers.fixtures";

// `providers` is a mutable module singleton; a fresh copy per test stops keys leaking between them.
function freshConverter(name: string, key?: string): any {
  let Converter: any;
  jest.isolateModules(() => {
    Converter = require("../../src/converter").Converter;
  });
  return key === undefined ? new Converter(name) : new Converter(name, key);
}

function isolated(fixture: ProviderFixture, ...outcomes: any[]) {
  const converter = freshConverter(fixture.name, fixture.key);

  // Every Config appends ExchangeRateAPI as a fallback; drop it so a failure
  // surfaces instead of falling through to another provider.
  while (converter.active.length > 1) {
    converter.remove(converter.active[1]);
  }

  const mock = mockClient(...outcomes);
  converter.config.setClient(mock.client);
  return { converter, mock };
}

let errorLog: jest.SpyInstance;

beforeEach(() => {
  errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => errorLog.mockRestore());

describe.each(PROVIDER_FIXTURES.map((f) => [f.name, f] as const))(
  "%s",
  (_name, fixture) => {
    it("builds the documented request URL", async () => {
      const { converter, mock } = isolated(fixture, response(fixture.success));

      await converter.convert(AMOUNT, "USD", "EUR");

      expect(mock.url()).toBe(fixture.url);
    });

    it("extracts the rate from a success response and converts", async () => {
      const { converter } = isolated(fixture, response(fixture.success));

      await expect(converter.convert(AMOUNT, "USD", "EUR")).resolves.toBeCloseTo(
        EXPECTED,
        10
      );
    });

    it("is case-insensitive about the target currency", async () => {
      const { converter } = isolated(fixture, response(fixture.success));

      await expect(converter.convert(AMOUNT, "USD", "eur")).resolves.toBeCloseTo(
        EXPECTED,
        10
      );
    });

    it("rejects when the response contains no usable rate", async () => {
      const { converter } = isolated(fixture, response({}));

      await expect(converter.convert(AMOUNT, "USD", "EUR")).rejects.toThrow(
        fixture.emptyResponse
      );
    });

    const handled = fixture.handledError;
    (handled ? it : it.skip)(
      "maps a recognised API error to its documented message",
      async () => {
        const outcome = handled!.http
          ? httpError(handled!.http, handled!.payload)
          : response(handled!.payload);
        const { converter } = isolated(fixture, outcome);

        // 2.0: thrown as a real Error, with the vendor's value on `cause`.
        await expect(converter.convert(AMOUNT, "USD", "EUR")).rejects.toThrow(
          handled!.message
        );
      }
    );

    const unhandled = fixture.unhandledError;
    (unhandled ? it : it.skip)(
      "surfaces an unrecognised API error unchanged",
      async () => {
        const outcome = unhandled!.http
          ? httpError(unhandled!.http, unhandled!.payload)
          : response(unhandled!.payload);
        const { converter } = isolated(fixture, outcome);

        await expect(converter.convert(AMOUNT, "USD", "EUR")).rejects.toMatchObject(
          { cause: unhandled!.error }
        );
      }
    );
  }
);

describe("provider fallback", () => {
  // CurrencyLayer plus the three implicit keyless fallbacks.
  const IMPLICIT_FALLBACKS = 3;

  function withFallback(...outcomes: any[]) {
    const converter = freshConverter("CurrencyLayer", "K");
    expect(converter.active).toHaveLength(1 + IMPLICIT_FALLBACKS);

    const mock = mockClient(...outcomes);
    converter.config.setClient(mock.client);
    return { converter, mock };
  }

  it("falls back to the next provider on a handled error", async () => {
    const { converter, mock } = withFallback(
      response({ error: { code: 101 } }),
      response({ rates: { EUR: 0.9 } })
    );

    await expect(converter.convert(AMOUNT, "USD", "EUR")).resolves.toBeCloseTo(
      EXPECTED,
      10
    );
    expect(mock.urls()[1]).toContain("exchangerate-api.com");
  });

  it("drops the failed provider from the active list", async () => {
    const { converter } = withFallback(
      response({ error: { code: 101 } }),
      response({ rates: { EUR: 0.9 } })
    );

    await converter.convert(AMOUNT, "USD", "EUR");

    expect(converter.active).toHaveLength(IMPLICIT_FALLBACKS);
    expect(converter.active[0].endpoint.base).toContain("exchangerate-api.com");
  });

  it("does not fall back on an unhandled error", async () => {
    const { converter, mock } = withFallback(response({ error: { code: 999 } }));

    await expect(converter.convert(AMOUNT, "USD", "EUR")).rejects.toMatchObject({
      cause: 999
    });
    expect(mock.urls()).toHaveLength(1);
  });

  it("falls back when the transport fails", async () => {
    const { converter, mock } = withFallback(
      transportError("ECONNREFUSED"),
      response({ rates: { EUR: 0.9 } })
    );

    await expect(converter.convert(AMOUNT, "USD", "EUR")).resolves.toBeCloseTo(
      EXPECTED,
      10
    );
    expect(mock.urls()).toHaveLength(2);
  });

  it("surfaces the transport error once no provider remains", async () => {
    const { converter } = isolated(
      PROVIDER_FIXTURES[0],
      transportError("ECONNREFUSED")
    );

    // The original error reaches the caller, with its message intact, instead
    // of being reported as an empty response.
    await expect(converter.convert(AMOUNT, "USD", "EUR")).rejects.toThrow(
      /ECONNREFUSED/
    );
  });

  it("falls back on an HTTP error the provider does not recognise", async () => {
    const { converter, mock } = withFallback(
      httpError(500),
      response({ rates: { EUR: 0.9 } })
    );

    await expect(converter.convert(AMOUNT, "USD", "EUR")).resolves.toBeCloseTo(
      EXPECTED,
      10
    );
    expect(mock.urls()).toHaveLength(2);
  });

  it("throws once the fallback chain is exhausted", async () => {
    // Every provider in the chain must fail before the error surfaces.
    const { converter, mock } = withFallback(
      response({ error: { code: 101 } }),
      httpError(404)
    );

    // 2.0 throws Error objects; the message depends on which fallback
    // surfaces, so pin the type rather than the wording.
    await expect(converter.convert(AMOUNT, "USD", "EUR")).rejects.toBeInstanceOf(
      Error
    );

    // Walked past the first provider; the exact depth depends on which of the
    // fallbacks recognises a 404.
    expect(mock.urls().length).toBeGreaterThan(1);
  });
});

describe("known defects", () => {
  // Each test records current, wrong behaviour. When one fails, the underlying
  // bug has been fixed and the test should be inverted to assert the fix.

  it("maps an AlphaVantage rate limit so it can fall back", async () => {
    const { converter } = isolated(
      PROVIDER_FIXTURES[4],
      response({ Information: "API rate limit reached" })
    );

    // 2.0: thrown as a real Error rather than the bare message string.
    await expect(converter.convert(AMOUNT, "USD", "EUR")).rejects.toThrow(
      "API rate limit reached."
    );
  });
});

describe("contract coverage", () => {
  it("has a fixture for every registered provider", () => {
    let providers: any;
    jest.isolateModules(() => {
      providers = require("../../src/parts/providers").providers;
    });

    expect(PROVIDER_FIXTURES.map((f) => f.name).sort()).toEqual(
      Object.keys(providers).sort()
    );
  });
});
