/**
 * The fallback chain, driven against the requester's failure contract:
 *
 *   { handled: boolean, transient?: boolean, error: unknown }
 *
 * fetchRates is mocked so each classification can be exercised directly,
 * rather than inferred from whichever vendor payload happens to produce it.
 */

jest.mock("../../src/parts/requester", () => ({
  fetchRates: jest.fn()
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
      single: "%FROM%-%TO%",
      multiple: ""
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

  // config.providers returns the live array, so this replaces the chain
  // without registering names in the global provider singleton.
  converter.config.providers.length = 0;
  converter.config.providers.push(...chain);

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

describe("handled + permanent", () => {
  it("removes the failed provider from the active list", async () => {
    const { converter, chain } = converterWith(2);
    mockFetch
      .mockImplementationOnce(
        failure({ handled: true, error: "Invalid API key!" })
      )
      .mockImplementationOnce(success());

    await converter.convert(15, "USD", "EUR");

    expect(converter.providers).toEqual([chain[1]]);
  });

  it("never empties the chain, so the converter stays usable", async () => {
    const { converter, chain } = converterWith(2);
    mockFetch.mockImplementation(failure({ handled: true, error: "Invalid API key!" }));

    await expect(converter.convert(15, "USD", "EUR")).rejects.toThrow();

    // Both failed permanently, but the last one is kept: a converter with no
    // providers is dead for the rest of the process.
    expect(converter.providers).toEqual([chain[1]]);
  });

  it("treats an explicit transient: false the same way", async () => {
    const { converter, chain } = converterWith(2);
    mockFetch
      .mockImplementationOnce(
        failure({ handled: true, transient: false, error: "Invalid API key!" })
      )
      .mockImplementationOnce(success());

    await converter.convert(15, "USD", "EUR");

    expect(converter.providers).toEqual([chain[1]]);
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
    converter.config.providers.length = 0;

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
