import { fetchRates } from "./parts/requester";
import { Provider, providers, UserDefinedProvider } from "./parts/providers";
import { Config, initializationConfig } from "./parts/config";
export { Chainer as Convert } from "./parts/chainer";
import _to from "await-to-js";

/**
 * A simple map object for rates
 *
 * @export
 * @interface rateObject
 */
export interface rateObject {
  [currencyName: string]: number;
}

/**
 * Regular converter class definition.
 *
 * @export
 * @class Converter
 */
export class Converter {
  /**
   * Converter's main config object.
   *
   * @type {Config}
   * @memberof Converter
   */
  config: Config;

  /**
   * Creates an instance of Converter and initializes the config.
   * @param {initializationConfig} config - base config
   * @memberof Converter
   */
  constructor(...config: initializationConfig[] | undefined[] | string[]) {
    this.config = new Config(...config);

    // Forwarding config adder fucntion
    this.add = this.config.add;
    this.addMultiple = this.config.addMultiple;
    this.remove = this.config.remove;
  }

  /**
   * Getters for active providers
   *
   * @readonly
   * @type {Provider[]}
   * @memberof Converter
   */
  get providers(): Provider[] {
    return this.config.providers;
  }
  get active(): Provider[] {
    return this.config.providers;
  }

  // Proxy function definitions
  add: Function;
  addMultiple: Function;
  remove: Function;

  /**
   * Conversion function (non chainable).
   *
   * @example
   * const converter = new Converter()
   * const converted = await converter.convert(15,"USD","EUR")
   * console.log(converted);
   *
   * @param {number} amount - amount to be converted
   * @param {string} from - base currency
   * @param {string} to - conversion currency
   * @param {any} rates - conversion rates, if they were pre-fetched
   * @returns {Promise<number>} - converted amount
   */

  convert = async (
    amount: number,
    from: string,
    to: string,
    rates: any = undefined
  ): Promise<number> => {
    // Returining conversion from provided rates
    if (typeof rates !== "undefined") {
      return amount * rates[to];
    }

    //Fetching conversion rates from the active provider
    const [err, data] = await _to(this.getRates(from, to, false));

    if (err) {
      throw err;
    }

    if (!data || Object.keys(data).length == 0) {
      throw new Error("No data returned for rate fetch.");
    }

    // Normalizing resulting rates data
    return amount * data[to];
  };

  /**
   * Rate fetch function
   * @param {string} from - base currency
   * @param {string} to - conversion currency
   * @param {boolean} multiple - determines conversion mode
   * @returns
   */
  getRates = async (
    from: string,
    to: string,
    multiple: boolean = false
  ): Promise<rateObject> => {
    // Getting the current active provider
    const provider = this.config.activeProvider();

    // Fetching conversion rates from the active provider.
    const [err, data] = await (<any>_to(
      fetchRates(provider, {
        FROM: from,
        TO: to,
        multiple: multiple
      })
    ));

    // error handling:
    // if the error is not in the registered list of errors (is undefined), then throw.
    // if the error is in the list, but there are no backup providers, then throw.
    // if the error is in the list and there is a backup, log the error and continue.
    if (!err) {
      return provider.handler(data);
    }

    // unrecognized error
    if (!err.handled) {
      throw err.error;
    }

    // logging existing error
    console.error(err.error);

    if (this.config.providers.length <= 1) {
      throw err.error;
    }

    // removing current provider from active list
    this.config.remove(provider);

    // Retrying...
    return this.getRates(from, to, multiple);
  };
}
