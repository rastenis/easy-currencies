# easy-currencies

[![npm version](http://img.shields.io/npm/v/easy-currencies.svg?style=flat)](https://npmjs.org/package/easy-currencies "View this project on npm")
[![CI](https://github.com/rastenis/easy-currencies/actions/workflows/ci.yml/badge.svg)](https://github.com/rastenis/easy-currencies/actions/workflows/ci.yml)

Convert currencies with ease! Eight exchange rate providers to choose from, others easily implementable.

## Features

- Easily convert currencies using one of the eight built-in API providers
- Two modes of operation:
  - Easy mode - no configuration or API keys required at all
  - Custom mode - choose one or more providers, use key-gated providers.
- Add custom providers (private or public)
- Provider fallbacks - automatic switching of active providers in the case of failure

## Install

```bash
$ npm install easy-currencies
```

## Usage (Easy/chain mode)

Easy/chain mode does not require initialization, and thus uses the default, no API key-required provider (api.exchangerate-api.com)

```js
// CommonJS
const { Convert } = require("easy-currencies");
```

```js
// ES6
import { Convert } from "easy-currencies";

const value = await Convert(15).from("USD").to("EUR");

console.log(value); // converted value
```

## Usage (custom mode)

Default provider initialization, no key needed

```js
import { Converter } from "easy-currencies";

const converter = new Converter();
const value = await converter.convert(15, "USD", "EUR");

console.log(value); // converted value
```

## Usage (raw mode / cached mode)

Use this to get a JSON of conversion rates from your current provider.

```js
import { Convert } from "easy-currencies";

const convert = await Convert().from("USD").fetch();

console.log(convert.rates);
// {
//   USD: 1,
//   EUR: 0.858,
//   GBP: 0.736,
//   CAD: 1.39,
//   HKD: 7.84,
//   DKK: 6.42,
//   HUF: 312.8,
//   ...
//   __base: "USD"
// }
```

`__base` records the currency the table was fetched for. Passing a table to
`convert(amount, from, to, rates)` with a different `from` throws instead of
returning a wrong number, and the key is an ordinary one so the check still
works after the table has been through `JSON.stringify` and a cache. It is not a
rate: skip it when iterating, or import `RATES_BASE_KEY` to name it. An
underscore is not valid in a currency code, so it cannot collide with one.

This also allows for cached conversion:

```js
import { Convert } from "easy-currencies";

const convert = await Convert().from("USD").fetch();

// use the fetched rates: (does not use the current provider's API anymore)
const value1 = await convert.amount(10).to("GBP");

await convert.from("USD").fetch(); // refresh rates
// or await convert.from("GBP").fetch() to switch base currency

const value2 = await convert.amount(10).to("GBP");
```

## Using custom providers

Custom single provider initialization

```js
import { Converter } from "easy-currencies";

const converter = new Converter("OpenExchangeRates", "API_KEY");
const value = await converter.convert(15, "USD", "EUR");

console.log(value); // converted value
```

Custom multiple provider initialization

```js
import { Converter } from "easy-currencies";

const converter = new Converter(
  { name: "OpenExchangeRates", key: "API_KEY" },
  { name: "AlphaVantage", key: "API_KEY" },
  { name: "Fixer", key: "API_KEY" }
);
const value = await converter.convert(15, "USD", "EUR");
console.log(value); // converted value
```

Upgrading from 1.x? See [MIGRATION.md](MIGRATION.md).

## Supported providers and API keys

The first column is the exact name to pass to `new Converter()`.

The three keyless providers need no signup and are **used by default**: a
`new Converter()` tries them in the order below, so a conversion keeps working
when one of them is down. Nothing to configure.

| Name              | Service                                                   | API key      |
| ----------------- | --------------------------------------------------------- | ------------ |
| `ExchangeRateAPI` | [exchangerate-api.com](https://www.exchangerate-api.com/) | not required |
| `FloatRates`      | [floatrates.com](https://www.floatrates.com/)             | not required |
| `Frankfurter`     | [frankfurter.dev](https://frankfurter.dev/)               | not required, ECB currencies only |

The rest need a key from the provider. Naming one puts it first, ahead of the
keyless providers, which stay on as fallbacks.

| Name                 | Service                                                 | API key                              |
| -------------------- | ------------------------------------------------------- | ------------------------------------ |
| `ExchangeRatesAPIIO` | [exchangeratesapi.io](https://exchangeratesapi.io/)     | required                             |
| `CurrencyLayer`      | [currencylayer.com](https://currencylayer.com/)         | required, with base currency support |
| `OpenExchangeRates`  | [openexchangerates.org](https://openexchangerates.org/) | required                             |
| `AlphaVantage`       | [alphavantage.co](https://www.alphavantage.co/)         | required                             |
| `Fixer`              | [fixer.io](https://fixer.io/)                           | required, with base currency support |

`ExchangeRateAPI` and `ExchangeRatesAPIIO` are different services with confusingly similar names.

## Using a proxy or a custom client

Requests go through the global fetch, which has no proxy option. Supply your own
client to proxy, or to add an agent, retries or instrumentation.

If you already use axios, an axios instance satisfies the client interface as
is, including the rejection behaviour the fallback chain depends on:

```js
import axios from "axios";

converter.setClient(axios.create({ proxy: { host: "127.0.0.1", port: 8080 } }));
```

To stay dependency-free, use an undici dispatcher. **A client must reject on an
HTTP failure with the response attached.** `fetch` resolves on 4xx and 5xx, so a
client that does not check `r.ok` silently disables provider error mapping, the
429 retry and the fallback chain:

```js
import { ProxyAgent } from "undici";

const dispatcher = new ProxyAgent("http://127.0.0.1:8080");

converter.setClient({
  get: async (url) => {
    const r = await fetch(url, { dispatcher });
    let data;
    try {
      data = await r.json();
    } catch {
      data = undefined;
    }
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

A client is `{ get(url) }` resolving to `{ status, data, headers? }`. `headers`
is optional and enables `Retry-After` handling on a 429. TypeScript users passing
`dispatcher` to `fetch` need `{ dispatcher } as any`; it is not in the DOM
`RequestInit` type.

To keep the built-in client and change only the timeout:

```js
import { createClient } from "easy-currencies";

converter.setClient(createClient({ timeout: 30000 })); // default is 10000
```

## API

`Converter`:

- `new Converter(...providers)`
- `convert(amount, from, to, rates?)`
- `getRates(from, to, multiple?)`
- `convertRate(amount, to, rates)`
- `add(name, provider, setActive?)`
- `addMultiple(providers, setActive?)`
- `remove(provider)`
- `setClient(client)`

`Convert(amount?)`, chainable:

- `.from(currency)`
- `.amount(value)`
- `.fetch()`
- `.rates`
- `.to(currency)`

Full type signatures are in [etc/easy-currencies.api.md](etc/easy-currencies.api.md).

The list of configured (active) providers can be accessed like so:

```js
import { Converter } from "easy-currencies";

const converter = new Converter("OpenExchangeRates", "API_KEY");

console.log(converter.providers);
/**
 * [{
 *  endpoint: {
 *    base: "https://openexchangerates.org/api/latest.json?app_id=%KEY%",
 *    single: "&base=%FROM%",
 *  },
 *  key: "API_KEY",
 *  handler: function(data) {
 *    return data.rates;
 *  },
 *  errors: {
 *    401: "Invalid API key!"
 *  },
 *  errorHandler: function(data) {
 *    return data.status;
 *  }
 * },
 * // the keyless providers, added automatically as fallbacks (see below)
 * {
 *  endpoint: {
 *    base: "https://api.exchangerate-api.com/v4/latest/",
 *    single: "%FROM%",
 *  },
 *  key: undefined,
 *  handler: function(data) {
 *    return data.rates;
 *  },
 *  errors: {
 *    400: "Malformed query.",
 *    404: "Currency not found"
 *  },
 *  errorHandler: function(data) {
 *    return data.status;
 *  }
 * },
 * { // FloatRates, endpoint https://www.floatrates.com/daily/ },
 * { // Frankfurter, endpoint https://api.frankfurter.dev/v1/latest?base= }]
 */
```

The current active provider can be retrieved like this:

```js
import { Converter } from "easy-currencies";

const converter = new Converter("OpenExchangeRates", "API_KEY");

console.log(converter.config.activeProvider()); // ...provider data
```

### Automatic provider fallbacks

Upon creation of a converter, a default provider that does not require any API keys is automatically inserted into the list of active providers as a primary fallback. It always has lower priority than the providers the converter was initialized with.

If a provider is well defined(all possible errors are registered properly), a conversion error will log the mapped error, and remove the provider from the active providers list. The conversion flow will attempt to resume by repeating the conversion using a different active provider.

If there are no more providers to fall back on, the converter throws the error. Moreover, if the error is not registered (unhandled error), it will be thrown as well.

### Adding custom providers

Custom provider definitions can be added as such:

```js
import { Converter } from "easy-currencies";

const converter = new Converter();

converter.add("MyProvider", {
  // the name of the custom provider
  endpoint: {
    base: "http://myprovider.net/api/live?access_key=%KEY%", // the base endpoint of the conversion API, with %KEY% being the api key's slot
    single: "&source=%FROM%" // the string that will be appended to the base endpoint, with %FROM% being the base currency abbreviation
  },
  key: "API_KEY", // your api key
  handler: function (data) {
    // the function that takes the JSON data returned by the API and returns the rate key-value object
    return data.rates;
  },
  errors: {
    // key-value object of common errors and their text representations
    101: "Invalid API key!",
    201: "Invalid base currency!"
  },
  errorHandler: function (data) {
    // runs on every response, success included, so it must tolerate a body with no error
    return data && data.error ? data.error.code : null;
  }
});
```

`errorHandler` always receives the response body, on a 200 and on an HTTP
failure alike. If your vendor signals with a status code rather than in the
body, key `errors` by the status and return `null` here: an HTTP status is
matched against `errors` when the handler finds nothing.

Multiple providers can be added with addMultiple:

```js
import { Converter } from "easy-currencies";

const converter = new Converter();

converter.addMultiple([
  { name: "Name1", provider: provider1 },
  { name: "Name2", provider: provider2 }
]);
```

### Support

Submit bugs and feature requests through the project's issue tracker:

[![Issues](http://img.shields.io/github/issues/rastenis/easy-currencies.svg)](https://github.com/rastenis/easy-currencies/issues)
