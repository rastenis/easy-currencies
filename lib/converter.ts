import { Requester } from "./parts/requester";
import { Provider } from "./parts/providers";
import { Config, initializationConfig } from "./parts/config";
export { Chainer as Convert } from "./parts/chainer";
import _to from "await-to-js";

export class Converter {
  /**
   * Converter's main config object.
   *
   * @type {Config}
   * @memberof Converter
   */
  config: Config;

  /**
   *Creates an instance of Converter and initialized the config.
   * @param {initializationConfig} _config
   * @memberof Converter
   */
  constructor(...config: initializationConfig[] | undefined[] | string[]) {
    this.config = new Config(...config);
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
   * @returns
   */
  convert = async (amount: number, from: string, to: string) => {
    //Getting the current active provider
    const provider = this.config.activeProvider();

    //Fetching conversion rates from the active provider
    let [err, data] = await _to(
      Requester.getRates(provider, {
        FROM: from,
        TO: to,
        multiple: false
      })
    );

    if (err) {
      throw err;
    }

    //Normalizing resulting rates data
    data = provider.handler(data);

    // Normalizing resulting rates data
    return amount * data[to];
  };
}
