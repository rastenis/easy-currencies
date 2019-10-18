import { Converter } from "../converter";

import _to from "await-to-js";

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
export function Chainer(amount: number) {
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
    from: from,
    to: to
  };

  /**
   *  Return the current fetched rates (Semi-chain)
   */
  function rates(): any {
    return _currentRates;
  }

  // returning chainable
  return ob;

  /**
   * Chain member that sets
   *
   * @param {string} from
   * @returns chainable object
   */
  async function from(from: string) {
    _currentFrom = from;

    // fetching rates for the base currency for raw mode
    _currentRates = await _to(c.getRates(_currentFrom));

    return ob;
  }

  /**
   * Final chain member (ends chain)
   *
   * @param {string} to - final currency
   * @returns {number} - final converted amount
   */
  async function to(to: string) {
    _currentTo = to;

    // converting
    let c = new Converter();
    let [err, r] = await _to(
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
