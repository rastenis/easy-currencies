import { Provider, providers } from "./providers";

/**
 * Main configuration object.
 *
 * @interface config
 */
interface config {
  cache: boolean;
  // other configuration options
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
  private _config: config | undefined;

  /**
   * Array of active curency API providers.
   *
   * @type {Provider[]}
   * @memberof Config
   */
  active: Provider[];

  /**
   * Config getter
   *
   * @returns
   * @memberof Config
   */
  get() {
    return this._config;
  }

  activeProvider() {
    return this.active[0];
  }

  /**
   * Creates an instance of Config.
   * @param {(object | undefined)} config
   * @memberof Config
   */
  constructor(config: initializationConfig | undefined) {
    this._config = undefined;
    this.active = resolveConfig(config);
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
): Provider[] {
  // resolve default if none provided.
  if (typeof configuration === "undefined") {
    return [providers["ExchangeRatesAPI"]];
  }

  if (
    typeof configuration !== "object" &&
    typeof configuration !== "undefined"
  ) {
    throw "You must either supply nothing or a config object (see the 'config' section to see the different APIs that can be used)";
  }

  //TODO: return one or more providers, depending on configuration options

  let resolvedConfig = {
    key: configuration.key,
    provider: providers[configuration.provider]
  };

  if (!resolvedConfig.provider) {
    throw "No such provider. Please use a provider from the supported providers list.";
  }

  return [];
}
