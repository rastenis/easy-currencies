/**
 * The fallback chain, driven against the requester's failure contract:
 *
 *   { handled: boolean, error: unknown }
 *
 * fetchRates is mocked so each classification can be exercised directly,
 * rather than inferred from whichever vendor payload happens to produce it.
 * deadlineFrom is real: getRates calls it, and a budget far in the future keeps
 * it out of the way of what these tests are about.
 */

jest.mock("../../src/parts/requester", () => ({
  fetchRates: jest.fn(),
  deadlineFrom: () => Date.now() + 600000
}));

import { Converter } from "../../src/converter";
import { fetchRates } from "../../src/parts/requester";
import { Provider } from "../../src/parts/providers";

const mockFetch = fetchRates as unknown as jest.Mock;

const RATES = { EUR: 0.9 };

function fakeProvider(name: string): Provider {
  return {
    key: `key-${name}`,
    endpoint: {
      base: `https://${name}.example.com/`,
      single: "%FROM%-%TO%"
    },
    handler: (data: any) => data.rates,
    errors: {},
    errorHandler: () => null
  };
}

/** A converter whose active list is exactly `count` distinct fake providers. */
function converterWith(count: number) {
  const converter = new Converter();
  const chain = Array.from({ length: count }, (_, i) => fakeProvider(`p${i}`));

  // config.providers is a defensive copy, so replacing the chain goes through
  // the public API: drop the defaults, then register the fakes directly
  // (addMultiple, not add, so they keep object identity for `toEqual(chain)`).
  converter.providers.forEach((p) => converter.remove(p));
  converter.addMultiple(
    chain.map((provider, i) => ({ name: `p${i}`, provider })),
    false
  );

  converter.onError = () => {};

  return { converter, chain };
}

const success = () => () => Promise.resolve({ rates: RATES });
const failure = (failureShape: any) => () => Promise.reject(failureShape);

beforeEach(() => {
  mockFetch.mockReset();
});

describe("handled + transient", () => {
  it("falls through to the next provider", async () => {
    const { converter } = converterWith(2);
    mockFetch
      .mockImplementationOnce(
        failure({ handled: true, transient: true, error: new Error("blip") })
      )
      .mockImplementationOnce(success());

    await expect(converter.convert(15, "USD", "EUR")).resolves.toBeCloseTo(13.5, 10);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("keeps the failed provider in the active list", async () => {
    const { converter, chain } = converterWith(2);
    mockFetch
      .mockImplementationOnce(
        failure({ handled: true, transient: true, error: new Error("blip") })
      )
      .mockImplementationOnce(success());

    await converter.convert(15, "USD", "EUR");

    expect(converter.providers).toEqual(chain);
  });

  it("does not strip the chain after a single blip", async () => {
    // Measured before the fix: six providers dropped to one, permanently.
    const { converter } = converterWith(6);
    mockFetch.mockImplementationOnce(
      failure({ handled: true, transient: true, error: new Error("ECONNREFUSED") })
    );
    mockFetch.mockImplementation(success());

    await converter.convert(15, "USD", "EUR");

    expect(converter.providers).toHaveLength(6);

    // And the primary is still the primary on the next call.
    mockFetch.mockClear();
    await converter.convert(15, "USD", "EUR");

    expect(converter.providers).toHaveLength(6);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe("a provider failure never shrinks the chain", () => {
  it("keeps the failed provider after falling back", async () => {
    const { converter, chain } = converterWith(2);
    mockFetch
      .mockImplementationOnce(
        failure({ handled: true, error: "Invalid API key!" })
      )
      .mockImplementationOnce(success());

    await converter.convert(15, "USD", "EUR");

    // Eviction meant one bad currency, which every provider reports, stripped
    // the chain for the life of the process.
    expect(converter.providers).toEqual(chain);
  });

  it("keeps the chain intact when every provider fails", async () => {
    const { converter, chain } = converterWith(2);
    mockFetch.mockImplementation(failure({ handled: true, error: "Invalid API key!" }));

    await expect(converter.convert(15, "USD", "EUR")).rejects.toThrow();

    expect(converter.providers).toEqual(chain);
  });

  it("tries every provider in the chain before giving up", async () => {
    const { converter } = converterWith(3);
    mockFetch.mockImplementation(failure({ handled: true, error: "Invalid API key!" }));

    await expect(converter.convert(15, "USD", "EUR")).rejects.toThrow();

    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});

describe("unhandled", () => {
  it("throws immediately without trying the next provider", async () => {
    const { converter, chain } = converterWith(3);
    mockFetch.mockImplementation(failure({ handled: false, error: 999 }));

    await expect(converter.convert(15, "USD", "EUR")).rejects.toThrow(Error);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(converter.providers).toEqual(chain);
  });

  it("carries the original value on cause", async () => {
    const { converter } = converterWith(2);
    mockFetch.mockImplementation(failure({ handled: false, error: 999 }));

    await expect(converter.convert(15, "USD", "EUR")).rejects.toMatchObject({
      cause: 999
    });
  });

  it("does not fall back for a rejection that ignores the contract", async () => {
    // A TypeError from inside the requester is not a classified provider
    // failure, so it must surface rather than silently rotating providers.
    const { converter, chain } = converterWith(3);
    const raw = new TypeError("undefined is not a function");
    mockFetch.mockImplementation(() => Promise.reject(raw));

    await expect(converter.convert(15, "USD", "EUR")).rejects.toBe(raw);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(converter.providers).toEqual(chain);
  });
});

describe("chain exhaustion", () => {
  it("throws the last error once every provider has failed", async () => {
    const { converter } = converterWith(3);
    mockFetch
      .mockImplementationOnce(failure({ handled: true, error: "first" }))
      .mockImplementationOnce(failure({ handled: true, error: "second" }))
      .mockImplementationOnce(failure({ handled: true, error: "third" }));

    await expect(converter.convert(15, "USD", "EUR")).rejects.toThrow("third");
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("throws an Error, not the provider's bare string", async () => {
    const { converter } = converterWith(1);
    mockFetch.mockImplementation(failure({ handled: true, error: "Invalid API key!" }));

    const caught = await converter
      .convert(15, "USD", "EUR")
      .catch((e: unknown) => e);

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("Invalid API key!");
  });

  it("wraps a non-string, non-Error rejection value", async () => {
    const { converter } = converterWith(1);
    mockFetch.mockImplementation(failure({ handled: true, error: 42 }));

    await expect(converter.convert(15, "USD", "EUR")).rejects.toThrow(
      /Rate provider failed: 42/
    );
  });

  it("reports an empty provider list rather than crashing", async () => {
    const converter = new Converter();
    converter.providers.forEach((p) => converter.remove(p));

    await expect(converter.convert(15, "USD", "EUR")).rejects.toThrow(
      /No rate providers are configured/
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("error reporting", () => {
  let errorLog: jest.SpyInstance;

  beforeEach(() => {
    errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => errorLog.mockRestore());

  it("defaults to console.error, as before", async () => {
    const { converter } = converterWith(2);
    converter.onError = new Converter().onError;
    mockFetch
      .mockImplementationOnce(failure({ handled: true, error: "Invalid API key!" }))
      .mockImplementationOnce(success());

    await converter.convert(15, "USD", "EUR");

    expect(errorLog).toHaveBeenCalledWith("Invalid API key!");
  });

  it("routes to a replacement hook instead of stderr", async () => {
    const { converter } = converterWith(2);
    const onError = jest.fn();
    converter.onError = onError;
    mockFetch
      .mockImplementationOnce(failure({ handled: true, error: "Invalid API key!" }))
      .mockImplementationOnce(success());

    await converter.convert(15, "USD", "EUR");

    expect(onError).toHaveBeenCalledWith("Invalid API key!");
    expect(errorLog).not.toHaveBeenCalled();
  });

  it("can be silenced entirely", async () => {
    const { converter } = converterWith(2);
    converter.onError = () => {};
    mockFetch
      .mockImplementationOnce(failure({ handled: true, error: "Invalid API key!" }))
      .mockImplementationOnce(success());

    await converter.convert(15, "USD", "EUR");

    expect(errorLog).not.toHaveBeenCalled();
  });

  it("is not called for an unhandled error, which is thrown not logged", async () => {
    const { converter } = converterWith(2);
    const onError = jest.fn();
    converter.onError = onError;
    mockFetch.mockImplementation(failure({ handled: false, error: "boom" }));

    await expect(converter.convert(15, "USD", "EUR")).rejects.toThrow("boom");

    expect(onError).not.toHaveBeenCalled();
  });
});
