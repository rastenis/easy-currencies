# Migrating from 1.x to 2.0

Most code needs no change. `Convert(15).from("USD").to("EUR")` and
`new Converter(name, key).convert(...)` work exactly as before.

Everything that does change is listed below, worst first.

## Node 18 or newer is required

2.0 uses the global `fetch` instead of axios, which makes the package
dependency-free. `fetch` landed in Node 18, so Node 16 and earlier will fail
with `fetch is not defined`.

Staying on Node 16 is a valid reason to stay on 1.x, which is still supported.
If you need 2.0 on Node 16, polyfill before the first conversion:

```js
const { fetch } = require("undici"); // undici@^5 supports Node 16
globalThis.fetch = fetch;
```

## `setProxyConfiguration` is gone

`fetch` has no proxy option, so a fixed `{host, port, auth}` object cannot be
honoured. Supply a client instead — which also covers custom agents, retries and
instrumentation.

```js
// 1.x
converter.setProxyConfiguration({ host, port, auth });

// 2.0
import { ProxyAgent } from "undici";
const dispatcher = new ProxyAgent(`http://${host}:${port}`);

converter.setClient({
  get: (url) =>
    fetch(url, { dispatcher }).then(async (r) => ({
      status: r.status,
      data: await r.json()
    }))
});
```

A client is `{ get(url) }` resolving to `{ status, data, headers? }`. For an
HTTP failure, reject with an error carrying `response: { status, data, headers }`
so providers can map their error codes, and for a transport failure reject with
an error carrying `code`. `createClient({ timeout })` is exported if you only
want to change the timeout.

`setClient` also moved onto `Converter`; `converter.config.setClient` still works.

## Errors are `Error` objects

1.x threw bare strings and numbers, so `catch (e) { log(e.message) }` logged
`undefined`.

```js
try {
  await converter.convert(15, "USD", "EUR");
} catch (e) {
  // 1.x:  if (e === "Invalid API key!")
  if (e.message === "Invalid API key!") {
    // ...
  }
}
```

The original value is preserved on `e.cause`. Anything comparing a caught value
with `===` against a string needs updating.

## Currency codes must be alphanumeric

Codes are checked against `/^[A-Za-z0-9]{1,16}$/` before a request is built, and
are percent-encoded. This closes a path-traversal hole: `from: ".."` used to
climb the URL and return a 404 that looked like "Currency not found".

Every code the bundled providers accept passes — including `USDT`, `1INCH`, `0G`
and lower-case input. Only values that were never valid currencies are rejected.

## Deep imports no longer resolve

```js
// 1.x, worked by accident:
//   require("easy-currencies/dist/parts/providers")
const { providers } = require("easy-currencies");
```

`package.json` now has an `exports` map, so only the package root resolves.
Everything previously reachable that way is exported from the root, including the
types: `Provider`, `Providers`, `ProviderReference`, `UserDefinedProvider`,
`ProviderErrors`, `Config`, `rateObject`, `chainableConverter`, `HttpClient`,
`HttpResponse`, `HttpError`, `ClientOptions`.

## Removed names

| Removed | Use instead |
| --- | --- |
| `converter.addProvider` | `converter.add` (it was the same function) |
| `converter.addMultipleProviders` | `converter.addMultiple` (same function) |
| `ProxyConfiguration` type | `HttpClient` |
| `Provider.endpoint.multiple` | nothing — it was never read |

Custom providers no longer need a `multiple` template:

```js
const provider = {
  // 1.x also required: multiple: "%FROM%"
  endpoint: { base: "https://api.example/", single: "%FROM%" },
  key: "API_KEY",
  handler: (data) => data.rates,
  errors: { 404: "Currency not found" },
  errorHandler: (data) => data.status
};
```

## Behaviour that changed without an API change

- **Requests time out after 10 seconds.** 1.x waited forever, so a hung vendor
  hung the caller and the fallback never fired. Adjust with
  `converter.setClient(createClient({ timeout: 30000 }))`.
- **A rate of zero, a negative rate, `Infinity`, or a string with trailing
  garbage is rejected** instead of being multiplied into a plausible wrong
  amount. So is a non-finite amount, which used to return `NaN`.
- **A transient failure no longer drops a provider.** Only a permanent fault — a
  bad key, say — removes one from the rotation, so a single network blip no
  longer strips the chain for the life of the process.
- **`console.error` is no longer written unconditionally.** Set
  `converter.onError = () => {}` to silence it, or route it into your logger.
- **A provider that answers for a different base currency is rejected.** Some
  vendors truncate an unrecognised code to a valid prefix and answer for that
  instead.
