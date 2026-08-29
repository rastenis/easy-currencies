import { Converter, rateObject } from "../converter";

/**
 * The chainable object interface.
 *
 * @interface chainableConverter
 */
export interface chainableConverter {
  from: (from: string) => chainableConverter;
  to: (to: string) => Promise<number>;
  fetch: () => Promise<chainableConverter>;
  /** Undefined until `fetch()` has resolved; `any` used to hide that. */
  rates: rateObject | undefined;
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
  let _currentRates: rateObject | undefined = undefined;
  // Base currency the cached rates were fetched for.
  let _ratesBase: string | undefined = undefined;

  // local converter
  const _converter = new Converter();

  /**
   *  Return object construction, prepared for chaining.
   */
  const chainable: chainableConverter = {
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
    _currentRates = await _converter.getRates(<string>_currentFrom, "", true);
    _ratesBase = _currentFrom;
    return chainable;
  }

  // returning chainable
  return chainable;

  /**
   * Chain member that sets the base currency
   *
   * @param {string} from
   * @returns chainable object
   */
  function _amount(val: number) {
    _currentAmount = val;
    return chainable;
  }

  /**
   * Chain member that sets
   *
   * @param {string} from
   * @returns chainable object
   */
  function _from(from: string) {
    // Cached rates belong to the previous base. Keeping them would silently
    // convert with the wrong ones, so drop them and let .to() refetch.
    if (_ratesBase !== undefined && from !== _ratesBase) {
      _currentRates = undefined;
      _ratesBase = undefined;
    }
    _currentFrom = from;
    return chainable;
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
    const result = await _converter.convert(
      <number>_currentAmount,
      <string>_currentFrom,
      _currentTo,
      _currentRates
    );

    return result;
  }
}
