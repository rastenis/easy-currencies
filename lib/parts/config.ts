import { Provider, providers } from "./providers";

/**
 * Normalized config.
 *
 * @interface config
 */
interface config {
  key: any;
  provider: Provider;
}

/**
 * Interface for the format of data passed in to the module initially.
 *
 * @interface initializationConfig
 */
export interface initializationConfig {
  key: any;
  provider: string;
}

/**
 * Config object that initializes with configuration data
 * passed in by the user.
 *
 * @export
 * @class Config
 */
export class Config {
  /**
   * Internal config
   *
   * @type {config}
   * @memberof Config
   */
  __config: config;

  /**
   * Config getter
   *
   * @returns
   * @memberof Config
   */
  get() {
    return this.__config;
  }

  /**
   * Creates an instance of Config.
   * @param {(object | undefined)} config
   * @memberof Config
   */
  constructor(config: object | undefined) {
    this.__config = resolveConfig(<initializationConfig>config);
  }
}

/**
 * Config resolver that normalizes configuration input into the config interface
 *
 * @export
 * @param {(object | undefined)} configuration - initial configuration
 * @returns {config} - normalized configuration object
 */
export function resolveConfig(
  configuration: initializationConfig | undefined
): config {
  // resolve default if none provided.
  if (typeof configuration === "undefined") {
    return {
      key: undefined,
      provider: providers.ExchangeRatesAPI
    };
  }

  if (
    typeof configuration !== "object" &&
    typeof configuration !== "undefined"
  ) {
    throw "You must either supply nothing or a config object (see the 'config' section to see the different APIs that can be used)";
  }

  let resolvedConfig = {
    key: configuration.key,
    provider: providers[configuration.provider]
  };

  if (!resolvedConfig.provider) {
    throw "No such provider. Please use a provider from the supported providers list.";
  }

  return <config>resolvedConfig;
}
