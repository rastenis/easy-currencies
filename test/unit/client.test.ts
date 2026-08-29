import { createServer, Server } from "http";
import { AddressInfo } from "net";
import { createClient } from "../../src/parts/client";

/**
 * The default client, against a real socket.
 *
 * These pin the contract custom providers depend on. axios rejected on non-2xx
 * and handed `err.response` to the provider's errorHandler; fetch resolves on
 * every status, so the client has to restore that or a provider written as
 * `errorHandler: (data) => data.status` silently stops mapping its errors.
 */

let server: Server;
let base: string;

function serve(handler: (req: any, res: any) => void) {
  server = createServer(handler).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
}

afterEach(() => server?.close());

const json = (status: number, body: any) => (_req: any, res: any) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

describe("createClient", () => {
  it("resolves a 200 with parsed data", async () => {
    serve(json(200, { rates: { EUR: 0.9 } }));

    await expect(createClient().get(base)).resolves.toMatchObject({
      status: 200,
      data: { rates: { EUR: 0.9 } }
    });
  });

  it("rejects a non-2xx with the status and body under `response`", async () => {
    serve(json(403, { status: 403 }));

    // The shape providers read: errorHandler(err.response).
    await expect(createClient().get(base)).rejects.toMatchObject({
      response: { status: 403, data: { status: 403 } }
    });
  });

  it("rejects a 429 with a status the retry loop can see", async () => {
    serve(json(429, {}));

    await expect(createClient().get(base)).rejects.toMatchObject({
      response: { status: 429 }
    });
  });

  it("exposes response headers, lower-cased", async () => {
    serve((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json", "X-Mixed-Case": "v" });
      res.end("{}");
    });

    const result = await createClient().get(base);

    expect(result.headers).toMatchObject({ "x-mixed-case": "v" });
  });

  it("exposes headers on a failure too, so Retry-After survives", async () => {
    serve((_req, res) => {
      res.writeHead(429, { "Retry-After": "1", "Content-Type": "application/json" });
      res.end("{}");
    });

    await expect(createClient().get(base)).rejects.toMatchObject({
      response: { status: 429, headers: { "retry-after": "1" } }
    });
  });

  it("parses a JSON body regardless of content-type", async () => {
    // Some providers serve JSON as text/plain.
    serve((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(JSON.stringify({ rates: { EUR: 0.9 } }));
    });

    await expect(createClient().get(base)).resolves.toMatchObject({
      data: { rates: { EUR: 0.9 } }
    });
  });

  it("treats an unparseable body as no data rather than failing", async () => {
    serve((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<html>outage</html>");
    });

    await expect(createClient().get(base)).resolves.toMatchObject({
      status: 200,
      data: undefined
    });
  });

  it("rejects a transport failure with a code and no response", async () => {
    serve(json(200, {}));
    const dead = base;
    server.close();

    const err: any = await createClient()
      .get(dead)
      .catch((e) => e);

    expect(err.response).toBeUndefined();
    expect(err.code).toBe("ECONNREFUSED");
  });

  describe("error shapes fetch can produce", () => {
    const realFetch = global.fetch;
    afterEach(() => {
      global.fetch = realFetch;
    });

    const rejectWith = (value: any) => {
      global.fetch = jest.fn(() => Promise.reject(value)) as any;
      return createClient().get("http://example.invalid/");
    };

    it("maps an AbortError to a timeout code", async () => {
      const abort = Object.assign(new Error("aborted"), { name: "AbortError" });

      await expect(rejectWith(abort)).rejects.toMatchObject({ code: "ETIMEDOUT" });
    });

    it("reads a code carried directly on the error", async () => {
      const err = Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });

      await expect(rejectWith(err)).rejects.toMatchObject({ code: "ECONNRESET" });
    });

    it("prefers the cause's code over one on the error", async () => {
      const err = Object.assign(new Error("fetch failed"), {
        code: "OUTER",
        cause: { code: "ENOTFOUND" }
      });

      await expect(rejectWith(err)).rejects.toMatchObject({ code: "ENOTFOUND" });
    });

    it("falls back to a generic message when the rejection carries none", async () => {
      await expect(rejectWith({})).rejects.toMatchObject({
        message: "fetch failed",
        code: undefined
      });
    });

    // Mutation testing found five OptionalChaining survivors here: nothing in
    // the suite distinguished `err?.message` from `err.message`, so a mutant
    // that deleted the `?.` still passed every test even though it throws a
    // bare TypeError for a null/undefined rejection instead of an HttpError.
    it("falls back to a generic message when the rejection is null", async () => {
      await expect(rejectWith(null)).rejects.toMatchObject({
        message: "fetch failed",
        code: undefined
      });
    });

    it("falls back to a generic message when the rejection is undefined", async () => {
      await expect(rejectWith(undefined)).rejects.toMatchObject({
        message: "fetch failed",
        code: undefined
      });
    });
  });

  it("aborts a hung request once the timeout elapses", async () => {
    serve(() => {
      /* never responds */
    });

    const err: any = await createClient({ timeout: 150 })
      .get(base)
      .catch((e) => e);

    expect(err.code).toBe("ETIMEDOUT");
    expect(err.response).toBeUndefined();
  });

  describe("response size cap", () => {
    it("rejects a body over the configured cap instead of buffering it", async () => {
      serve((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ rates: { EUR: "x".repeat(2000) } }));
      });

      const err: any = await createClient({ maxResponseSize: 1024 })
        .get(base)
        .catch((e) => e);

      // Same shape as a transport failure: the fallback chain in requester.ts
      // only checks `failed && !response` to decide a provider gets retried,
      // so a size-cap error has to carry no `.response` to be treated the same
      // way as a dropped connection rather than a parsed (bad) answer.
      expect(err).toBeInstanceOf(Error);
      expect(err.response).toBeUndefined();
    });

    it("still resolves a body exactly at the cap", async () => {
      // Pins `> limit` rather than `>= limit`: a boundary flip here would
      // silently start rejecting well-formed rate tables sized right at the cap.
      const body = JSON.stringify({ rates: { EUR: 0.9 } });
      const padded = body + " ".repeat(1024 - body.length);
      serve((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(padded);
      });

      await expect(
        createClient({ maxResponseSize: 1024 }).get(base)
      ).resolves.toMatchObject({ data: { rates: { EUR: 0.9 } } });
    });

    it("still parses a normal small body under the default cap", async () => {
      serve(json(200, { rates: { EUR: 0.9 } }));

      await expect(createClient().get(base)).resolves.toMatchObject({
        data: { rates: { EUR: 0.9 } }
      });
    });
  });
});

describe("an over-cap body explains itself through the chain", () => {
  it("carries a code, because the requester will not echo a message", async () => {
    // The requester refuses to propagate a client's message verbatim, since
    // that is where a request URL and its API key end up. A reason carried
    // only in the message reaches the consumer as "Error (message withheld)".
    (globalThis as any).fetch = async () =>
      new Response(JSON.stringify({ pad: "x".repeat(4096) }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });

    const client = createClient({ maxResponseSize: 512 });

    await expect(client.get("https://x.example/rate")).rejects.toMatchObject({
      code: "E_RESPONSE_TOO_LARGE"
    });
  });
});
