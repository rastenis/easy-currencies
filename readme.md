# easy-currencies

[![npm version](http://img.shields.io/npm/v/easy-currencies.svg?style=flat)](https://npmjs.org/package/easy-currencies "View this project on npm")
[![Status](https://travis-ci.com/Scharkee/easy-currencies.svg?branch=master)](https://travis-ci.com/scharkee/easy-currencies)
[![Coverage Status](https://coveralls.io/repos/github/Scharkee/easy-currencies/badge.svg?branch=master)](https://coveralls.io/github/Scharkee/easy-currencies?branch=master)
[![David](https://img.shields.io/david/scharkee/easy-currencies.svg)](https://david-dm.org/scharkee/easy-currencies)

Convert currencies with ease! Five exchange rate providers to choose from, others easily implementable.

## Features

- Easily convert currencies using one of the five built-in API providers
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

Easy/chain mode does not require initialization, and thus uses the default, no API key-required provider (exchangeratesapi.io)

```js
// CommonJS
const { Convert } = require("easy-currencies");
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
//   CAD: 1.3590288853,
//   HKD: 7.750132908,
//   ISK: 139.4648236754,
//   PHP: 49.5286195286,
//   DKK: 6.6004784689,
//   HUF: 314.9831649832,
//   USD: 1,
//   ...
// }
```

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
  { name: "AlphaVantage", key: "API_KEY" }
  { name: "Fixer", key: "API_KEY" }
);
const value = await converter.convert(15, "USD", "EUR");
console.log(value); // converted value
```

## Supported providers and API keys

The list of supoprted exchange rate providers is as follows:

1. [ExchangeRatesAPI](https://exchangeratesapi.io/) (default, no API key required)
2. [CurrencyLayer](https://currencylayer.com/) (requires an api key with base currency supoprt)
3. [OpenExchangeRates](https://openexchangerates.org/)
4. [AlphaVantage](https://www.alphavantage.co/)
5. [Fixer](https://fixer.io/) (requires an api key with base currency supoprt)

## Using proxy

```js
import { Converter } from "easy-currencies";

const converter = new Converter();
converter.setProxyConfiguration({
  host: "127.0.0.1",
  port: 8080,
  auth: { username: "user", password: "pass" }
});

// Further usage will be proxied!
```

## API

Check out the [api reference docs.](https://scharkee.github.io/easy-currencies/)

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
 *    multiple: "&base=%FROM%"
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
 * }]
 */
```

The current active provider can be retrieved like this:

```js
import { Converter } from "easy-currencies";

const converter = new Converter("OpenExchangeRates", "API_KEY");

console.log(converter.activeProvider()); // ...provider data
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
    single: "&source=%FROM%", // the string that will be appended to the base endpoint, with %FROM% being the base currency abbreviation
    multiple: "&source=%FROM%&currencies=%TO%" // the string that will be appended to the base endpoint when fetching specific currencies, with %TO% being the target currencies, separated by ','
  },
  key: "API_KEY", // your api key
  handler: function(data) {
    // the function that takes the JSON data returned by the API and returns the rate key-value object
    return data.rates;
  },
  errors: {
    // key-value object of common errors and their text representations
    101: "Invalid API key!"
    201: "Invalid base currency!"
  },
  errorHandler: function(data) {
    // the function that takes the JSON error data and returns the error status (could be a HTTP status or a custom API-layer status)
    return data.error.code;
  }
});
```

Multiple providers can be added with addMultiple:

```js
import { Converter } from "easy-currencies";

const converter = new Converter();

converter.add([
  { name: "Name1", provider: provider1 },
  { name: "Name2", provider: provider2 }
]);
```

### Support

Submit bugs and feature requests through the project's issue tracker:

[![Issues](http://img.shields.io/github/issues/Scharkee/easy-currencies.svg)](https://github.com/Scharkee/easy-currencies/issues)
