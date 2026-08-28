import { mockClient, response, httpError } from "../helpers/mockClient";
import { Provider } from "../../src/parts/providers";
import { Query } from "../../src/parts/requester";

/**
 * `sleep` is mocked rather than driven with fake timers: the retry loop awaits
 * inside a `while(true)`, so fake timers would require hand-flushing the
 * microtask queue between every attempt. Mocking the delay keeps the test
 * deterministic while still letting us assert the backoff schedule.
 */
jest.mock("../../src/parts/utils", () => {
  const actual = jest.requireActual("../../src/parts/utils");
  return { ...actual, sleep: jest.fn(() => Promise.resolve()) };
});

// Imported after the mock so the requester binds to the mocked sleep.
import { fetchRates } from "../../src/parts/requester";
import { sleep } from "../../src/parts/utils";

const sleepMock = sleep as unknown as jest.Mock;

const query: Query = { FROM: "USD", TO: "EUR", multiple: false };

const provider: Provider = {
  endpoint: { base: "https://api.example.com", single: "/rate", multiple: "" },
  key: "k",
  handler: (data: any) => data.rates,
  errors: { 101: "Invalid API key!" },
  errorHandler: (data: any) => (data && data.status ? data.status : null)
};

beforeEach(() => jest.clearAllMocks());

describe("429 handling", () => {
  it("retries after a 429 and returns the eventual success", async () => {
    const { client, get } = mockClient(
      httpError(429),
      response({ rates: { EUR: 0.9 } })
    );

    const data = await fetchRates(client, provider, query);

    expect(data).toEqual({ rates: { EUR: 0.9 } });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("backs off exponentially between attempts", async () => {
    const { client } = mockClient(
      httpError(429),
      httpError(429),
      httpError(429),
      response({ rates: { EUR: 0.9 } })
    );

    await fetchRates(client, provider, query);

    const delays = sleepMock.mock.calls.map((c) => c[0] as number);
    expect(delays).toHaveLength(3);

    // Each delay is the previous doubled, plus up to 1000ms of jitter.
    expect(delays[0]).toBeGreaterThanOrEqual(1000);
    expect(delays[0]).toBeLessThan(2000);
    expect(delays[1]).toBeGreaterThanOrEqual(2000);
    expect(delays[1]).toBeLessThan(3000);
    expect(delays[2]).toBeGreaterThanOrEqual(4000);
    expect(delays[2]).toBeLessThan(5000);
  });

  it("gives up after 5 retries rather than looping forever", async () => {
    const { client, get } = mockClient(httpError(429));

    await expect(fetchRates(client, provider, query)).rejects.toEqual({
      handled: false,
      error: "Too many 429 responses, giving up."
    });

    // 6 attempts: the initial request plus maxRetries (5) retries.
    expect(get).toHaveBeenCalledTimes(6);
    expect(sleepMock).toHaveBeenCalledTimes(5);
  });

  it("does not retry non-429 failures", async () => {
    const { client, get } = mockClient(httpError(500));

    await expect(fetchRates(client, provider, query)).rejects.toBeDefined();

    expect(get).toHaveBeenCalledTimes(1);
    expect(sleepMock).not.toHaveBeenCalled();
  });
});

describe("transport failures", () => {
  const networkError = () => Object.assign(new Error("connect ECONNREFUSED"), {
    code: "ECONNREFUSED",
    config: { url: "https://api.example.com/rate?access_key=SUPERSECRET" }
  });

  it("classifies a rejection without a response as handled, so callers fall back", async () => {
    const { client } = mockClient(networkError());

    await expect(fetchRates(client, provider, query)).rejects.toMatchObject({
      handled: true
    });
  });

  it("preserves the error code", async () => {
    const { client } = mockClient(networkError());

    await expect(fetchRates(client, provider, query)).rejects.toMatchObject({
      error: expect.objectContaining({ code: "ECONNREFUSED" })
    });
  });

  it("does not carry the request URL, which embeds the API key", async () => {
    const { client } = mockClient(networkError());

    const [err] = await fetchRates(client, provider, query).catch((e) => [e]);

    // Callers log these; the raw axios error would write the key to their logs.
    expect(JSON.stringify(err) + String((err as any).error)).not.toContain(
      "SUPERSECRET"
    );
  });

  it("classifies an unrecognised HTTP failure as handled rather than crashing", async () => {
    // A provider that reads errors from the response body sees nothing in an
    // HTTP 500, so previously execution fell through to `result.data` on an
    // undefined result.
    const bodyErrorProvider = {
      ...provider,
      errorHandler: (data: any) => (data && data.error ? data.error.code : null)
    };
    const { client } = mockClient(httpError(500));

    await expect(fetchRates(client, bodyErrorProvider, query)).rejects.toMatchObject({
      handled: true
    });
  });
});

describe("error classification", () => {
  it("marks errors present in the provider's map as handled", async () => {
    const { client } = mockClient(response({ status: 101 }));

    await expect(fetchRates(client, provider, query)).rejects.toEqual({
      handled: true,
      error: "Invalid API key!"
    });
  });

  it("marks errors absent from the provider's map as unhandled", async () => {
    const { client } = mockClient(response({ status: 999 }));

    await expect(fetchRates(client, provider, query)).rejects.toEqual({
      handled: false,
      error: 999
    });
  });
});
