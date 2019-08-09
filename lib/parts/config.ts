import { Provider, providers, resolveProvider } from "./providers";

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
   * Array of active curency API providers.
   *
   * @type {Provider[]}
   * @memberof Config
   */
  private _active: Provider[];

  /**
   * Provider getters
   *
   * @returns {Provider[]}
   * @memberof Config
   */
  get providers(): Provider[] {
    return this._active;
  }

  activeProvider() {
    return this._active[0];
  }

  /**
   * Creates an instance of Config.
   * @param {(object | undefined)} config
   * @memberof Config
   */
  constructor(...config: initializationConfig[] | undefined[] | string[]) {
    this._active = resolveProviders(...config);
  }
}

/**
 * Config resolver that normalizes configuration input into the config interface
 *
 * @export
 * @param {(object | undefined)} configuration - initial configuration
 * @returns {config} - normalized configuration object
 */
export function resolveProviders(
  ...configuration: initializationConfig[] | undefined[] | string[]
): Provider[] {
  // resolve default if none provided.
  if (typeof configuration === "undefined") {
    return [providers["ExchangeRatesAPI"]];
  }

  if (
    typeof configuration[0] !== "object" &&
    typeof configuration[0] !== "undefined" &&
    typeof configuration[0] !== "string"
  ) {
    throw "You must either supply nothing or a config object (see the 'config' section to see the different APIs that can be used)";
  }

  // returning single provider
  if (typeof configuration[0] === "string") {
    // constructing in initializationConfig object from string values
    return [resolveProvider({ name: configuration[0], key: configuration[1] })];
  }

  return [];
}
