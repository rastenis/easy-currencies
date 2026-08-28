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

        await expect(converter.convert(AMOUNT, "USD", "EUR")).rejects.toBe(
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

        await expect(converter.convert(AMOUNT, "USD", "EUR")).rejects.toBe(
          unhandled!.error
        );
      }
    );
  }
);

describe("provider fallback", () => {
  // CurrencyLayer plus the implicit ExchangeRateAPI fallback.
  function withFallback(...outcomes: any[]) {
    const converter = freshConverter("CurrencyLayer", "K");
    expect(converter.active).toHaveLength(2);

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

    expect(converter.active).toHaveLength(1);
    expect(converter.active[0].endpoint.base).toContain("exchangerate-api.com");
  });

  it("does not fall back on an unhandled error", async () => {
    const { converter, mock } = withFallback(response({ error: { code: 999 } }));

    await expect(converter.convert(AMOUNT, "USD", "EUR")).rejects.toBe(999);
    expect(mock.urls()).toHaveLength(1);
  });

  it("throws once the fallback chain is exhausted", async () => {
    const { converter, mock } = withFallback(
      response({ error: { code: 101 } }),
      httpError(404)
    );

    await expect(converter.convert(AMOUNT, "USD", "EUR")).rejects.toBe(
      "Currency not found"
    );
    expect(mock.urls()).toHaveLength(2);
  });
});

describe("known defects", () => {
  // Each test records current, wrong behaviour. When one fails, the underlying
  // bug has been fixed and the test should be inverted to assert the fix.

  it("erases transport failures and reports them as empty data", async () => {
    const { converter } = isolated(PROVIDER_FIXTURES[0], transportError("ECONNREFUSED"));

    // Should surface ECONNREFUSED. fetchRates passes err.response (undefined)
    // to the errorHandler, which throws, and the original error is lost.
    await expect(converter.convert(AMOUNT, "USD", "EUR")).rejects.toThrow(
      /No data returned for rate fetch/
    );
  });

  it("does not fall back when the transport fails", async () => {
    const converter = freshConverter("CurrencyLayer", "K");
    const mock = mockClient(transportError(), response({ rates: { EUR: 0.9 } }));
    converter.config.setClient(mock.client);

    await expect(converter.convert(AMOUNT, "USD", "EUR")).rejects.toBeTruthy();

    // A transient network blip should try the next provider; it never does.
    expect(mock.urls()).toHaveLength(1);
  });

  it("leaves ExchangeRatesAPIIO unable to map any of its documented errors", async () => {
    const { converter } = isolated(
      PROVIDER_FIXTURES[1],
      response({ success: false, error: { code: 101 } })
    );

    // Should reject with "Invalid API key!". The errorHandler reads data.status
    // rather than data.error.code, so the error body is treated as success and
    // the caller gets a misleading message instead.
    await expect(converter.convert(AMOUNT, "USD", "EUR")).rejects.toThrow(
      /No data returned for rate fetch/
    );
  });

  it("treats an AlphaVantage rate limit as unhandled instead of retrying", async () => {
    const { converter } = isolated(
      PROVIDER_FIXTURES[4],
      response({ Information: "API rate limit reached" })
    );

    // errorHandler returns 429, but the errors map has no 429 entry, so this is
    // classified unhandled: no retry, no fallback.
    await expect(converter.convert(AMOUNT, "USD", "EUR")).rejects.toBe(429);
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
