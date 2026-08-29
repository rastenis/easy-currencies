import { inspect } from "util";
import { mockClient, response, httpError } from "../helpers/mockClient";
import { HttpClient, HttpError } from "../../src/parts/client";
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
  endpoint: { base: "https://api.example.com", single: "/rate" },
  key: "k",
  handler: (data: any) => data.rates,
  errors: { 101: "Invalid API key!" },
  errorHandler: (data: any) => (data && data.status ? data.status : null)
};

/** A 429 whose response carries headers, as a custom client may supply them. */
const rateLimited = (headers: any): HttpError => {
  const err = httpError(429);
  (err.response as any).headers = headers;
  return err;
};

/** A client that rejects every request with exactly the given value. */
const rejectsWith = (value: unknown): HttpClient =>
  ({ get: () => Promise.reject(value) } as unknown as HttpClient);

/** The rejection of a fetch that is expected to fail. */
const failureOf = async (client: HttpClient, p: Provider = provider, options?: any) =>
  fetchRates(client, p, query, options).then(
    () => {
      throw new Error("expected fetchRates to reject");
    },
    (e) => e
  );

const delays = () => sleepMock.mock.calls.map((c) => c[0] as number);

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

    // Three retries needs one more than the default allows.
    await fetchRates(client, provider, query, { maxRetries: 3 });

    expect(delays()).toHaveLength(3);

    // Each delay is the previous doubled, plus up to 1000ms of jitter.
    expect(delays()[0]).toBeGreaterThanOrEqual(1000);
    expect(delays()[0]).toBeLessThan(2000);
    expect(delays()[1]).toBeGreaterThanOrEqual(2000);
    expect(delays()[1]).toBeLessThan(3000);
    expect(delays()[2]).toBeGreaterThanOrEqual(4000);
    expect(delays()[2]).toBeLessThan(5000);
  });

  it("gives up after 2 retries rather than looping forever", async () => {
    const { client, get } = mockClient(httpError(429));

    const err = await failureOf(client);

    // 3 attempts: the initial request plus maxRetries (2) retries. The old
    // default of 5 ran 31s per provider, and the schedule restarted for each
    // one in the chain.
    expect(get).toHaveBeenCalledTimes(3);
    expect(sleepMock).toHaveBeenCalledTimes(2);
    expect(err.error).toBeInstanceOf(Error);
    expect(err.error.message).toMatch(/rate limited, giving up after 3 attempts/);
  });

  it("marks exhaustion handled, so the caller falls back", async () => {
    const { client } = mockClient(httpError(429));

    expect(await failureOf(client)).toMatchObject({
      handled: true
    });
  });

  it("does not retry a non-429 failure, but leaves it recoverable", async () => {
    const { client, get } = mockClient(httpError(500));

    // The 500 reaches the provider's errorHandler, which does not recognise it,
    // so it surfaces unhandled rather than being retried or swallowed.
    // Transient, not fatal: a 500 the provider does not enumerate says nothing
    // about the providers behind it, so the caller must be free to try them.
    await expect(fetchRates(client, provider, query)).rejects.toMatchObject({
      handled: true
    });

    expect(get).toHaveBeenCalledTimes(1);
    expect(sleepMock).not.toHaveBeenCalled();
  });
});

describe("Retry-After", () => {
  it("waits the number of seconds the server asked for", async () => {
    const { client } = mockClient(
      rateLimited({ "retry-after": "3" }),
      response({ rates: { EUR: 0.9 } })
    );

    await fetchRates(client, provider, query);

    // Exactly the server's figure: no jitter on top of explicit guidance.
    expect(delays()).toEqual([3000]);
  });

  it("reads the header whatever its casing", async () => {
    const { client } = mockClient(
      rateLimited({ "Retry-After": 2 }),
      response({ rates: { EUR: 0.9 } })
    );

    await fetchRates(client, provider, query);

    expect(delays()).toEqual([2000]);
  });

  it("reads a fetch-style Headers object", async () => {
    const headers = {
      get: (name: string) => (name.toLowerCase() === "retry-after" ? "4" : null)
    };
    const { client } = mockClient(
      rateLimited(headers),
      response({ rates: { EUR: 0.9 } })
    );

    await fetchRates(client, provider, query);

    expect(delays()).toEqual([4000]);
  });

  it("accepts an HTTP date", async () => {
    const at = new Date(Date.now() + 5000).toUTCString();
    const { client } = mockClient(
      rateLimited({ "retry-after": at }),
      response({ rates: { EUR: 0.9 } })
    );

    await fetchRates(client, provider, query);

    // Second resolution in the header, so allow the rounding.
    expect(delays()[0]).toBeGreaterThan(3500);
    expect(delays()[0]).toBeLessThanOrEqual(5000);
  });

  it("treats a date already past as retry now", async () => {
    const { client } = mockClient(
      rateLimited({ "retry-after": new Date(Date.now() - 60000).toUTCString() }),
      response({ rates: { EUR: 0.9 } })
    );

    await fetchRates(client, provider, query);

    expect(delays()).toEqual([0]);
  });

  it("clamps the server's figure to the cap", async () => {
    const { client } = mockClient(
      rateLimited({ "retry-after": "3600" }),
      response({ rates: { EUR: 0.9 } })
    );

    await fetchRates(client, provider, query, { maxDelay: 5000 });

    expect(delays()).toEqual([5000]);
  });

  it("falls back to the backoff when the header is unusable", async () => {
    const unusable = [
      { "retry-after": "soon" },
      { "retry-after": ["3"] },
      { "x-other": "3" },
      {},
      undefined
    ];

    for (const headers of unusable) {
      sleepMock.mockClear();
      const { client } = mockClient(
        rateLimited(headers),
        response({ rates: { EUR: 0.9 } })
      );

      await fetchRates(client, provider, query);

      expect(delays()[0]).toBeGreaterThanOrEqual(1000);
      expect(delays()[0]).toBeLessThan(2000);
    }
  });

  it("ignores a Headers-like object that answers with a non-string", async () => {
    const { client } = mockClient(
      rateLimited({ get: () => 3 }),
      response({ rates: { EUR: 0.9 } })
    );

    await fetchRates(client, provider, query);

    expect(delays()[0]).toBeLessThan(2000);
  });
});

describe("retry options", () => {
  it("caps the exponential delay", async () => {
    const { client } = mockClient(
      httpError(429),
      httpError(429),
      httpError(429),
      response({ rates: { EUR: 0.9 } })
    );

    await fetchRates(client, provider, query, { maxDelay: 1500, maxRetries: 3 });

    // 1000, then 2000 and 4000 both clamped to 1500 — jitter still applies.
    expect(delays()[0]).toBeGreaterThanOrEqual(1000);
    expect(delays()[1]).toBeGreaterThanOrEqual(1500);
    expect(delays()[1]).toBeLessThan(2500);
    expect(delays()[2]).toBeLessThan(2500);
  });

  it("honours a lower maxRetries", async () => {
    const { client, get } = mockClient(httpError(429));

    await failureOf(client, provider, { maxRetries: 1 });

    expect(get).toHaveBeenCalledTimes(2);
    expect(sleepMock).toHaveBeenCalledTimes(1);
  });

  it("gives up immediately when retries are disabled", async () => {
    const { client, get } = mockClient(httpError(429));

    await failureOf(client, provider, { maxRetries: 0 });

    expect(get).toHaveBeenCalledTimes(1);
    expect(sleepMock).not.toHaveBeenCalled();
  });

  it.each([
    ["NaN and a negative", { maxRetries: NaN, maxDelay: -1 }],
    // Infinity is the one non-finite value that would otherwise retry forever.
    ["Infinity", { maxRetries: Infinity, maxDelay: Infinity }]
  ])("ignores %s rather than hanging or looping", async (_label, options) => {
    const { client, get } = mockClient(httpError(429));

    await failureOf(client, provider, options);

    // Both fall back to the defaults: 3 attempts, 2 waits.
    expect(get).toHaveBeenCalledTimes(3);
    expect(delays()[1]).toBeGreaterThanOrEqual(2000);
    expect(delays()[1]).toBeLessThan(3000);
  });
});

describe("transport failures", () => {
  const networkError = () =>
    Object.assign(new Error("connect ECONNREFUSED"), {
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
    const planted = Object.assign(networkError(), {
      // A leak hides anywhere on the original error, the stack included; the
      // requester must build a fresh error rather than forward this one.
      stack: "Error: connect ECONNREFUSED\n    at get (?access_key=SUPERSECRET)"
    });
    const { client } = mockClient(planted);

    const err = await failureOf(client);

    // Callers log these, and a logger prints the whole object graph.
    expect(inspect(err, { depth: null })).not.toContain("SUPERSECRET");
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

    const err = await failureOf(client, bodyErrorProvider);

    expect(err).toMatchObject({ handled: true });
    expect(err.error.message).toBe("Request to the provider failed: HTTP 500");
  });

  it("does not leak the request URL through a client's `.message`", async () => {
    // Neither shape carries a usable `.code`, so `describe()` fell through to
    // `.message` verbatim: a bare `fetch()` throws exactly this TypeError for a
    // malformed URL, and node-fetch's FetchError does the same for a DNS or
    // connection failure. Both embed the request, key included.
    const urlShaped = new TypeError(
      "Failed to parse URL from https://api.example.com/rate?access_key=SUPERSECRET"
    );
    const { client } = mockClient(urlShaped);

    const err = await failureOf(client);

    expect(err.error.message).not.toContain("SUPERSECRET");
    expect(inspect(err, { depth: null })).not.toContain("SUPERSECRET");
  });
});

describe("non-Error rejections", () => {
  const messageFor = async (value: unknown) =>
    (await failureOf(rejectsWith(value))).error.message;

  it("describes a bare string", async () => {
    expect(await messageFor("boom")).toBe("Request to the provider failed: boom");
  });

  it("describes a number", async () => {
    expect(await messageFor(42)).toBe("Request to the provider failed: 42");
  });

  it("describes a falsy number rather than swallowing it", async () => {
    expect(await messageFor(0)).toBe("Request to the provider failed: 0");
  });

  it.each([[null], [undefined], [""], ["   "], [{}]])(
    "never renders %p as 'undefined'",
    async (value) => {
      expect(await messageFor(value)).toBe(
        "Request to the provider failed: unknown error"
      );
    }
  );

  it("prefers a numeric code over the message", async () => {
    expect(await messageFor({ code: 7, message: "ignored" })).toBe(
      "Request to the provider failed: 7"
    );
  });

  it("does not fall back to the message when the code is blank", async () => {
    // `message` is exactly where a client puts the request URL, so a blank
    // `code` must not resurrect it; a plain object carries no class name to
    // report instead, so this bottoms out at "unknown error".
    expect(await messageFor({ code: "  ", message: "  down for maintenance " })).toBe(
      "Request to the provider failed: unknown error"
    );
  });

  it("names the error class instead of echoing a present message", async () => {
    class Timeoutish extends Error {
      url = "https://api.example.com/rate?access_key=SUPERSECRET";
    }
    const err = await failureOf(
      rejectsWith(Object.assign(new Timeoutish("down for maintenance"), { code: "  " }))
    );

    expect(err.error.message).toBe(
      "Request to the provider failed: Timeoutish (message withheld)"
    );
    expect(inspect(err, { depth: null })).not.toContain("SUPERSECRET");
  });

  it("names an error class that carries no message, without dumping its fields", async () => {
    class Timeoutish extends Error {
      url = "https://api.example.com/rate?access_key=SUPERSECRET";
    }
    const err = await failureOf(rejectsWith(Object.assign(new Timeoutish(), { message: "" })));

    expect(err.error.message).toBe("Request to the provider failed: Timeoutish (no message)");
    expect(inspect(err, { depth: null })).not.toContain("SUPERSECRET");
  });

  it("survives a null-prototype object, which String() throws on", async () => {
    expect(await messageFor(Object.create(null))).toBe(
      "Request to the provider failed: unknown error"
    );
  });

  it("keeps a falsy rejection a failure rather than reading data off nothing", async () => {
    await expect(fetchRates(rejectsWith(null), provider, query)).rejects.toMatchObject({
      handled: true
    });
  });
});

describe("error classification", () => {
  it("marks errors present in the provider's map as handled", async () => {
    const { client } = mockClient(response({ status: 101 }));

    // toMatchObject, not toEqual: the rejection is a FetchRatesError (an Error
    // subclass, for only-throw-error), and Jest's toEqual special-cases Error
    // values to compare only `.message` against a plain object, which would
    // pass no matter what `handled`/`error` held.
    await expect(fetchRates(client, provider, query)).rejects.toMatchObject({
      handled: true,
      error: "Invalid API key!"
    });
  });

  it("marks a mapped provider error handled, like every other failure", async () => {
    const { client } = mockClient(response({ status: 101 }));

    expect(await failureOf(client)).toMatchObject({ handled: true });
  });

  it("marks errors absent from the provider's map as handled", async () => {
    const { client } = mockClient(response({ status: 999 }));

    await expect(fetchRates(client, provider, query)).rejects.toMatchObject({
      handled: true,
      error: 999
    });
  });

  it("phrases an unmapped numeric error from an HTTP failure as HTTP <status>", async () => {
    // ExchangeRateAPI's real errorHandler is `data => data.status`. A body that
    // happens to carry a `status` the provider does not enumerate used to
    // surface as the bare number, which callers rendered as
    // "Rate provider failed: 500": naming neither the provider nor the fact
    // that 500 was an HTTP status.
    const echoesStatus = { ...provider, errorHandler: (data: any) => data.status };
    const { client } = mockClient(httpError(500, { status: 500 }));

    const err = await failureOf(client, echoesStatus);

    expect(err).toMatchObject({ handled: true });
    expect(err.error).toBeInstanceOf(Error);
    expect(err.error.message).toBe("Request to the provider failed: HTTP 500");
  });
});

describe("the time budget", () => {
  it("stops a client that never settles", async () => {
    // The 10s timeout lives inside the built-in client, so a caller-supplied
    // one used to hold convert() open for ever. Gating the retry sleeps alone
    // would not fire here: nothing sleeps while the request is outstanding.
    const client = { get: () => new Promise<any>(() => {}) } as any;

    const err = await failureOf(client, provider, { budgetMs: 40 });

    expect(err.handled).toBe(true);
    expect(err.error.message).toMatch(/ran out of time/);
  });

  it("refuses a request once the deadline has already passed", async () => {
    const { client, get } = mockClient(response({ rates: { EUR: 0.9 } }));

    const err = await failureOf(client, provider, { deadline: Date.now() - 1 });

    expect(get).not.toHaveBeenCalled();
    expect(err.error.message).toMatch(/ran out of time/);
  });

  it("does not sleep past the deadline just to fail on waking", async () => {
    const { client, get } = mockClient(httpError(429));

    // The first backoff is at least 1000ms, so it cannot fit.
    const err = await failureOf(client, provider, { budgetMs: 200 });

    expect(get).toHaveBeenCalledTimes(1);
    expect(sleepMock).not.toHaveBeenCalled();
    expect(err.error.message).toMatch(/ran out of time/);
  });

  it("leaves a request that finishes in time alone", async () => {
    const { client } = mockClient(response({ rates: { EUR: 0.9 } }));

    await expect(
      fetchRates(client, provider, query, { budgetMs: 5000 })
    ).resolves.toEqual({ rates: { EUR: 0.9 } });
  });
});

describe("an unmapped numeric error keeps what the vendor said", () => {
  it("reports the provider's code alongside the status when they differ", async () => {
    // apilayer sends its own code in the body and a status in the header. Both
    // matter: "HTTP 401" alone throws away the 101 that names the cause.
    const apilayerish = {
      ...provider,
      errors: { 999: "known" },
      errorHandler: (data: any) => (data && data.error ? data.error.code : null)
    };
    const { client } = mockClient(httpError(401, { error: { code: 101 } }));

    const err = await failureOf(client, apilayerish);

    expect(err.error.message).toBe(
      "Request to the provider failed: HTTP 401, provider code 101"
    );
  });

  it("does not repeat the status when the code is just the status echoed back", async () => {
    const echoesStatus = { ...provider, errorHandler: (data: any) => data.status };
    const { client } = mockClient(httpError(500, { status: 500 }));

    const err = await failureOf(client, echoesStatus);

    expect(err.error.message).toBe("Request to the provider failed: HTTP 500");
  });
});
