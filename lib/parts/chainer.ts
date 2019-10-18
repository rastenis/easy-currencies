import { Converter } from "../converter";

import __to from "await-to-js";

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
export function Chainer(amount: number | undefined) {
  let _currentAmount: number | undefined = amount;
  let _currentFrom: string | undefined = undefined;
  let _currentTo: string | undefined = undefined;
  let _currentRates: any | undefined = undefined;

  // local converter
  let c = new Converter();

  /**
   *  Return object construction, prepared for chaining.
   */
  let ob = {
    from: _from,
    to: _to,
    rates: _rates,
    fetch: _rates,
    amount: _amount
  };

  /**
   * Fetch the raw rates for the given currency.
   *
   * @returns {Promise<any>}
   */
  async function _rates(): Promise<any> {
    // fetching rates for the base currency
    _currentRates = await __to(c.getRates(<string>_currentFrom));
    return _currentRates;
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
    let c = new Converter();
    let [err, r] = await __to(
      c.convert(
        <number>_currentAmount,
        <string>_currentFrom,
        <string>_currentTo,
        _currentRates
      )
    );

    if (err) {
      throw err;
    }

    return r;
  }
}
