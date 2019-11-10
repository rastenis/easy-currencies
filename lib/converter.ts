import { fetchRates } from "./parts/requester";
import { Provider, providers, UserDefinedProvider } from "./parts/providers";
import { Config, initializationConfig } from "./parts/config";
export { Chainer as Convert } from "./parts/chainer";
import _to from "await-to-js";

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

  /**
   * Conversion function (non chainable).
   *
   * @example
   * let converter = new Converter()
   * let converted = await converter.convert(15,"USD","EUR")
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
    let [err, data] = await _to(this.getRates(from, to, false));

    if (err) {
      throw err;
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
  ): Promise<any> => {
    //Getting the current active provider
    const provider = this.config.activeProvider();

    //Fetching conversion rates from the active provider
    let [err, data] = await _to(
      fetchRates(provider, {
        FROM: from,
        TO: to,
        multiple: multiple
      })
    );

    if (err) {
      throw err;
    }

    // Normalizing resulting rates data and returning rates
    return provider.handler(data);
  };
}
