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

    await expect(createClient().get(base)).resolves.toEqual({
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

    await expect(createClient().get(base)).resolves.toEqual({
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
});
