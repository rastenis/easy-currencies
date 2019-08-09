import { Requester } from "./parts/requester";
import { Config, initializationConfig } from "./parts/config";
export { Chainer as Convert } from "./parts/chainer";

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
  constructor(_config: initializationConfig | undefined) {
    this.config = new Config(_config);
  }

  // TODO: get all if caching is enabled
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
    let data = <any>await Requester.getRates(provider, {
      FROM: from,
      TO: to,
      multiple: false
    });

    //Normalizing resulting rates data
    data = provider.handler(data);

    // Normalizing resulting rates data
    return amount * data[to];
  };

  get = (amount: number) => {
    return this;
  };
}
