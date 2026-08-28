# Migrating from 1.x to 2.0

`Convert(15).from("USD").to("EUR")` and `new Converter(name, key).convert(...)`
are unchanged. Everything else that changed is below.

## Node 18+

2.0 uses the global `fetch`. Node 16 fails with `fetch is not defined`.

Staying on Node 16 is a valid reason to stay on 1.x. To use 2.0 there, polyfill
before the first conversion:

```js
const { fetch } = require("undici"); // undici@^5 supports Node 16
globalThis.fetch = fetch;
```

## `setProxyConfiguration` removed

`fetch` has no proxy option. Pass a client instead.

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

A client is `{ get(url) }` resolving to `{ status, data, headers? }`. Reject with
an error carrying `response: { status, data, headers }` for an HTTP failure, or
`code` for a transport failure.

To change only the timeout: `converter.setClient(createClient({ timeout: 30000 }))`.

## Errors are `Error` objects

1.x threw strings and numbers, so `e.message` was `undefined`.

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

The original value is on `e.cause`. Update any `===` comparison against a string.

## Currency codes must match `/^[A-Za-z0-9]{1,16}$/`

Codes are validated and percent-encoded before a request is built. This closes a
path traversal: `from: ".."` used to climb the URL.

`USDT`, `1INCH`, `0G` and lowercase input all pass. Only values that were never
currencies are rejected.

## Deep imports removed

```js
// 1.x, worked by accident:
//   require("easy-currencies/dist/parts/providers")
const { providers } = require("easy-currencies");
```

`package.json` now has an `exports` map. Everything is exported from the root,
including the types: `Provider`, `Providers`, `ProviderReference`,
`UserDefinedProvider`, `ProviderErrors`, `Config`, `rateObject`,
`chainableConverter`, `HttpClient`, `HttpResponse`, `HttpError`, `ClientOptions`.

## Renamed and removed

| Removed | Use |
| --- | --- |
| `converter.addProvider` | `converter.add` |
| `converter.addMultipleProviders` | `converter.addMultiple` |
| `ProxyConfiguration` | `HttpClient` |
| `Provider.endpoint.multiple` | nothing, it was never read |

Custom providers drop the `multiple` template:

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

## Behaviour changes with no API change

| Change | What to do |
| --- | --- |
| Requests time out after 10s. 1.x waited forever. | `setClient(createClient({ timeout }))` to adjust |
| Zero, negative, `Infinity` and garbage rates are rejected | nothing, these produced wrong amounts before |
| A non-finite amount throws instead of returning `NaN` | nothing |
| A transient failure no longer drops a provider | nothing, only permanent faults evict now |
| `console.error` is no longer unconditional | `converter.onError = () => {}` to silence |
| A provider answering for a different base is rejected | nothing, this caught vendors truncating codes |
