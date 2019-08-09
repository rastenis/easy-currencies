import { Requester } from "./parts/requester";
import { Provider } from "./parts/providers";
import { Config, initializationConfig } from "./parts/config";

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
  constructor(_config: initializationConfig) {
    this.config = new Config(_config);
  }

  // TODO: get all if caching is enabled
  /**
   * Conversion function (non chainable).
   * @example
   * let converter = new Converter()
   * let converted = await converter.convert(15,"USD","EUR")
   * console.log(converted);
   *
   *
   * @memberof Converter
   */
  convert = async (amount: number, from: string, to: string) => {
    const provider = this.config.activeProvider();

    let rates = <any>await Requester.getRates(provider, {
      FROM: from,
      TO: to,
      multiple: false
    });

    // handling response
    rates = provider.handler(rates.data);

    return amount * rates[to];
  };
}
