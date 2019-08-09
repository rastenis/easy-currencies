import { Converter } from "../converter";

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

  /**
   *  Return object construction, prepared for chaining.
   */
  let ob = {
    from: from,
    to: to
  };

  // returning chainable
  return ob;

  /**
   * Chain member that sets
   *
   * @param {string} from
   * @returns chainable object
   */
  function from(from: string) {
    _currentFrom = from;
    return ob;
  }

  /**
   * Final chain member (ends chain)
   *
   * @param {string} to - final currency
   * @returns {number} - final converted amount
   */
  async function to(to: string): number {
    _currentTo = to;

    // converting
    let c = new Converter(undefined);
    let r = await c.convert(
      <number>_currentAmount,
      <string>_currentFrom,
      <string>_currentTo
    );
    return r;
  }
}
