import { Converter, rateObject } from "../converter";

import __to from "await-to-js";

/**
 * The chainable object interface.
 *
 * @interface chainableConverter
 */
interface chainableConverter {
  from: (from: string) => chainableConverter;
  to: (to: string) => Promise<number>;
  fetch: (to: string) => Promise<chainableConverter>;
  rates: rateObject;
  amount: (val: number) => chainableConverter;
}

/**
 * Chained converter.
 * It defaults to the basic API provider, and does not require initialization.
 *
 * @example
 *  let value = await Convert(15).from("USD").to("EUR");
 *
 * @export
 * @param {number} amount - amount of currency to convert
 * @returns
 */
export function Chainer(amount: number | undefined = undefined) {
  let _currentAmount: number | undefined = amount;
  let _currentFrom: string | undefined = undefined;
  let _currentTo: string | undefined = undefined;
  let _currentRates: any | undefined = undefined;

  // local converter
  const c = new Converter();

  /**
   *  Return object construction, prepared for chaining.
   */
  const ob: chainableConverter = {
    from: _from,
    to: _to,
    fetch: _fetch,
    get rates() {
      return _currentRates;
    },
    amount: _amount
  };

  /**
   * Chain member that fetches and caches the rates for the given currency.
   *
   * @returns chainable object
   */
  async function _fetch() {
    // fetching rates for the base currency
    _currentRates = await c.getRates(<string>_currentFrom, "", true);
    return ob;
  }

  // returning chainable
  return ob;

  /**
   * Chain member that sets the base currency
   *
   * @param {string} from
   * @returns chainable object
   */
  function _amount(val: number) {
    _currentAmount = val;
    return ob;
  }

  /**
   * Chain member that sets
   *
   * @param {string} from
   * @returns chainable object
   */
  function _from(from: string) {
    _currentFrom = from;
    return ob;
  }

  /**
   * Final chain member (ends chain)
   *
   * @param {string} to - final currency
   * @returns {number} - final converted amount
   */
  async function _to(to: string) {
    _currentTo = to;

    // converting
    const result = await c.convert(
      <number>_currentAmount,
      <string>_currentFrom,
      <string>_currentTo,
      _currentRates
    );

    return result;
  }
}
