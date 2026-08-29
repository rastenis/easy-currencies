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

Shortest path, if you already use axios: an axios instance satisfies the client
interface as is.

```js
// 1.x
converter.setProxyConfiguration({ host, port, auth });

// 2.0
import axios from "axios";
converter.setClient(axios.create({ proxy: { host, port, auth } }));
```

To stay dependency-free, use an undici dispatcher. **The client must reject on an
HTTP failure.** `fetch` resolves on 4xx and 5xx, so a client that skips the
`r.ok` check silently disables provider error mapping, the 429 retry and the
fallback chain.

```js
import { ProxyAgent } from "undici";
const dispatcher = new ProxyAgent(`http://${host}:${port}`);

converter.setClient({
  get: async (url) => {
    const r = await fetch(url, { dispatcher });
    let data;
    try { data = await r.json(); } catch { data = undefined; }
    const headers = Object.fromEntries(r.headers);

    if (!r.ok) {
      const err = new Error(`Request failed with status code ${r.status}`);
      err.response = { status: r.status, data, headers };
      throw err;
    }
    return { status: r.status, data, headers };
  }
});
```

A client is `{ get(url) }` resolving to `{ status, data, headers? }`. Reject with
an error carrying `response: { status, data, headers }` for an HTTP failure, or
`code` for a transport failure.

To change only the timeout: `converter.setClient(createClient({ timeout: 30000 }))`.

`setClient` is a `Converter` method. The `Convert()` chain builds its own
converter internally and does not expose it, so chain calls cannot take a custom
client. Behind a proxy, use a `Converter` instance:

```js
// no injection point
Convert(15).from("USD").to("EUR");

// use this instead
const converter = new Converter();
converter.setClient(myClient);
await converter.convert(15, "USD", "EUR");
```

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

## Custom providers are scoped to the converter

`add` and `addMultiple` used to write the provider, **including its API key**,
into the exported `providers` map. Any code in the process could read the key,
two libraries registering the same name collided, and unrelated code could
resolve a provider it never registered.

Custom providers now belong to the converter that added them. Two converters can
use the same name, and `require("easy-currencies").providers` holds only the
built-ins. A custom provider is no longer resolvable by name from elsewhere:

```js
const converter = new Converter();
converter.add("Mine", provider, true);

// 1.x: worked anywhere in the process. 2.0: throws.
// new Converter("Mine")
```

Names that shadow a built-in are rejected.

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
| A conversion is bounded to 20s across the whole chain. 1.x could run 102s. | `setRetryOptions({ budgetMs })` to adjust |
| A 429 is retried twice, not five times, capped at 8s | `setRetryOptions({ maxRetries, maxDelay })` to restore |
| Zero, negative, `Infinity` and garbage rates are rejected | nothing, these produced wrong amounts before |
| A non-finite amount throws instead of returning `NaN` | nothing |
| A failed provider is no longer dropped from the chain | nothing, but a permanently bad key now costs a failed request on every call |
| `console.error` is no longer unconditional | `converter.onError = () => {}` to silence |
| A provider answering for a different base is rejected | nothing, this caught vendors truncating codes |

## `errorHandler` always receives the response body

1.x passed the body on a 200 but the whole response object on an HTTP failure,
so a handler reading `data.error.code` saw `undefined` on every 4xx and 5xx and
its `errors` table was unreachable by status. It now receives the body in both
cases, and an HTTP status is matched against `errors` when the handler returns
nothing.

If your handler reads `data.status` to catch HTTP failures, drop that and key
`errors` by the status instead:

```js
// 1.x
errors: { 404: "Currency not found" },
errorHandler: (data) => data.status

// 2.0, same result
errors: { 404: "Currency not found" },
errorHandler: () => null
```

Leaving `data.status` in place is harmless: a body rarely carries a `status`
field, so it returns nothing and the status match answers instead.

## Fetched rate tables carry a `__base` key

`getRates` and `Convert().fetch()` add `__base` to the table, recording the
currency it was fetched for. Converting that table from a different base throws
rather than returning a wrong number, and because `__base` is an ordinary key
the check survives a cache round trip.

```js
const rates = await converter.getRates("USD", "", true);
// { EUR: 0.9, GBP: 0.8, __base: "USD" }

await redis.set("rates", JSON.stringify(rates));
const cached = JSON.parse(await redis.get("rates"));

await converter.convert(100, "GBP", "EUR", cached); // throws, base is USD
await converter.convert(100, "USD", "EUR", cached); // 90
```

If you iterate a fetched table, skip it. `RATES_BASE_KEY` is exported for that:

```js
import { RATES_BASE_KEY } from "easy-currencies";

for (const [code, rate] of Object.entries(rates)) {
  if (code === RATES_BASE_KEY) continue;
  // ...
}
```

Tables you build yourself carry no `__base` and are converted as before.
