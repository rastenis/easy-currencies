import { mockClient, response, httpError } from "../helpers/mockClient";
import {
  PROVIDER_FIXTURES,
  ProviderFixture,
  AMOUNT,
  EXPECTED
} from "../fixtures/providers.fixtures";

/**
 * The provider contract suite.
 *
 * Runs identical assertions against every supported provider, offline. No API
 * keys, no network, no vendor availability. Each provider is exercised through
 * the public `Converter` surface, so these tests also cover the config and
 * requester layers that sit between the caller and the provider definition.
 */

/**
 * Loads a fresh copy of the library. `providers` is a mutable module-level
 * singleton, so tests that skipped this would leak API keys into each other.
 */
function freshConverter(name: string, key?: string): any {
  let Converter: any;
  jest.isolateModules(() => {
    Converter = require("../../src/converter").Converter;
  });
  return key === undefined ? new Converter(name) : new Converter(name, key);
}

/**
 * A converter with exactly one active provider and a stubbed HTTP client, so a
 * failure surfaces instead of silently falling through to the default provider.
 */
function isolated(fixture: ProviderFixture, ...outcomes: any[]) {
  const converter = freshConverter(fixture.name, fixture.key);

  // Every Config appends ExchangeRateAPI as a fallback; drop it unless it is
  // the provider under test.
  while (converter.active.length > 1) {
    converter.remove(converter.active[1]);
  }

  const mock = mockClient(...outcomes);
  converter.config.setClient(mock.client);
  return { converter, mock };
}

describe.each(PROVIDER_FIXTURES.map((f) => [f.name, f] as const))(
  "%s",
  (_name, fixture) => {
    let errorLog: jest.SpyInstance;

    beforeEach(() => {
      // The library logs handled provider errors; keep test output readable.
      errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => errorLog.mockRestore());

    it("builds the documented request URL", async () => {
      const { converter, mock } = isolated(
        fixture,
        response(fixture.success)
      );

      await converter.convert(AMOUNT, "USD", "EUR");

      expect(mock.url()).toBe(fixture.url);
    });

    it("leaves no unsubstituted template placeholders in the URL", async () => {
      const { converter, mock } = isolated(
        fixture,
        response(fixture.success)
      );

      await converter.convert(AMOUNT, "USD", "EUR");

      expect(mock.url()).not.toMatch(/%(FROM|TO|KEY)%/);
    });

    it("extracts the rate from a success response and converts", async () => {
      const { converter } = isolated(fixture, response(fixture.success));

      const value = await converter.convert(AMOUNT, "USD", "EUR");

      expect(typeof value).toBe("number");
      expect(value).toBeCloseTo(EXPECTED, 10);
    });

    it("is case-insensitive about the target currency", async () => {
      const { converter } = isolated(fixture, response(fixture.success));

      const value = await converter.convert(AMOUNT, "USD", "eur");

      expect(value).toBeCloseTo(EXPECTED, 10);
    });

    it("rejects when the response contains no usable rate", async () => {
      const { converter } = isolated(fixture, response({}));

      await expect(converter.convert(AMOUNT, "USD", "EUR")).rejects.toBeDefined();
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

describe("contract coverage", () => {
  it("has a fixture for every registered provider", () => {
    let providers: any;
    jest.isolateModules(() => {
      providers = require("../../src/parts/providers").providers;
    });

    const registered = Object.keys(providers).sort();
    const covered = PROVIDER_FIXTURES.map((f) => f.name).sort();

    // Fails when a provider is added to the library without a contract fixture.
    expect(covered).toEqual(registered);
  });
});
