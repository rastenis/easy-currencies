# easy-currencies

[![npm version](http://img.shields.io/npm/v/easy-currencies.svg?style=flat)](https://npmjs.org/package/easy-currencies "View this project on npm")
[![Status](https://travis-ci.org/scharkee/easy-currencies.svg?branch=master)](https://travis-ci.org/scharkee/easy-currencies)
[![Coverage Status](https://coveralls.io/repos/github/Scharkee/easy-currencies/badge.svg?branch=master)](https://coveralls.io/github/Scharkee/easy-currencies?branch=master)
[![David](https://img.shields.io/david/scharkee/easy-currencies.svg)](https://david-dm.org/scharkee/easy-currencies)

Convert currencies with ease! Five exchange rate providers to choose from, others easily implementable.

## Features

- Easily convert currencies using one of the five built-in API providers
- Two modes of operation:
  - Easy mode - no configuration or API keys required at all
  - Custom mode - choose one or more providers, use key-gated providers.
- [WIP] Add custom providers (private and public)
- [WIP] Provider fallbacks - automatic switching of active providers in the case of failure

## Install

```console
# install easy-currencies
$ npm install easy-currencies
```

## Usage (Easy/chain mode)

Easy/chain mode does not require initialization, and thus uses the default, no API key-required provider (exchangeratesapi.io)

```js
// CommonJS
const { Convert } = require("easy-currencies");
// ES6
import { Convert } from "easy-currencies";

let value = await Convert(15)
  .from("USD")
  .to("EUR");
console.log(value); // converted value
```

## Usage (custom mode)

Default provider initialization, no key needed

```js
import { Converter } from "easy-currencies";

let converter = new Converter();
let value = await converter.convert(15, "USD", "EUR");
console.log(value); // converted value
```

Custom single provider initialization

```js
import { Converter } from "easy-currencies";

let converter = new Converter("OpenExchangeRates", "API_KEY");
let value = await converter.convert(15, "USD", "EUR");
console.log(value); // converted value
```

Custom multiple provider initialization

```js
import { Converter } from "easy-currencies";

let converter = new Converter(
  { name: "OpenExchangeRates", key: "API_KEY" },
  { name: "AlphaVantage", key: "API_KEY" }
  { name: "Fixer", key: "API_KEY" }
);
let value = await converter.convert(15, "USD", "EUR");
console.log(value); // converted value
```

## Supported providers and API keys

The list of supoprted exchange rate providers is as follows:

1. [ExchangeRatesAPI](https://exchangeratesapi.io/) (default, no API key required)
2. [CurrencyLayer](https://currencylayer.com/) (requires an api key with base currency supoprt)
3. [OpenExchangeRates](https://openexchangerates.org/)
4. [AlphaVantage](https://www.alphavantage.co/)
5. [Fixer](https://fixer.io/) (requires an api key with base currency supoprt)

## API

Check out the [api reference docs.](https://scharkee.github.io/easy-currencies/)

The list of configured (active) providers can be accessed like so:

```js
import { Converter } from "easy-currencies";
let converter = new Converter("OpenExchangeRates", "API_KEY");
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
let converter = new Converter("OpenExchangeRates", "API_KEY");
console.log(converter.activeProvider()); // ...provider data
```

### Support

Submit bugs and requests through the project's issue tracker:

[![Issues](http://img.shields.io/github/issues/Scharkee/easy-currencies.svg)](https://github.com/Scharkee/easy-currencies/issues)
