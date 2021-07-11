import axios, { AxiosInstance } from "axios";
import {
  Provider,
  providers,
  resolveProvider,
  UserDefinedProvider,
  ProviderReference
} from "./providers";

import { checkIfUserDefinedProvider } from "./utils";

/**
 * Proxy configuration object.
 */
export interface ProxyConfiguration {
  host: string;
  port: number;
  auth: { username: string; password: string };
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
   * Provider getter.
   *
   * @returns {Provider[]}
   * @memberof Config
   */
  get providers(): Provider[] {
    return this._active;
  }

  /**
   * Active client.
   */
  private _client: AxiosInstance = axios.create();

  /**
   * Client setter.
   * @param client  The client.
   */
  setClient = (client: AxiosInstance): void => {
    this._client = client;
  };

  /**
   * Client getter.
   */
  getClient = () => {
    return this._client;
  };

  /**
   * Provider setter (adder).
   *
   * @param {Provider[]} providers - providers to be added
   * @param {boolean} [setActive=false] - should the new provider(s) be prioritized
   * @returns {void}
   * @memberof Config
   */
  private addProviders(providers: Provider[], setActive: boolean): void {
    providers = providers.filter((p) => {
      return !this._active.find((a) => a == p);
    });

    if (setActive) {
      this._active.unshift(...providers);
      return;
    }
    this._active.push(...providers);
    return;
  }

  /**
   * Adds a single new, user-defined provider to the list of providers.
   *
   * @param {string} name - the new provider name
   * @param {Provider} provider - the new provider object
   * @param {boolean} [setActive=false] - should the new provider(s) be prioritized
   * @memberof Config
   */
  add = (
    name: string,
    provider: Provider,
    setActive: boolean = false
  ): void => {
    this.addMultiple([{ name, provider }], setActive);
  };

  /**
   * Adds multiple new, user-defined provider to the list of providers.
   *
   * @param {UserDefinedProvider[]} providers - providers to be added
   * @param {boolean} [setActive=false] - should the new provider(s) be prioritized
   * @memberof Config
   */
  addMultiple = (
    newProviders: UserDefinedProvider[],
    setActive: boolean = false
  ): void => {
    // Duplicate check
    newProviders.forEach((p) => {
      if (!checkIfUserDefinedProvider(p)) {
        throw "Invalid provider format!";
      }

      if (providers[p.name]) {
        throw "A provider by this name is already registered!";
      }
      providers[p.name] = p.provider;
    });

    // Adding provider to active providers
    this.addProviders(
      newProviders.map((p) => p.provider),
      setActive
    );
  };

  /**
   * Removes a specific provider
   * @param {Provider} provider - provider to be removed
   * @memberof Config
   */
  remove = (provider: Provider): void => {
    this._active = this._active.filter((p) => p != provider);
  };

  /**
   * Returns the current provider
   *
   * @returns {Provider} - current provider
   * @memberof Config
   */
  activeProvider(): Provider {
    return this._active[0];
  }

  /**
   * Creates an instance of Config.
   * @param {(...ProviderReference[] | undefined[] | string[])} config
   * @memberof Config
   */
  constructor(...config: ProviderReference[] | undefined[] | string[]) {
    this._active = resolveProviders(...config);

    // adding default fallback
    this.addProviders([providers.ExchangeRateAPI], false);
  }
}

/**
 * Config resolver that normalizes configuration input into the config interface
 *
 * @export
 * @param {(...ProviderReference[] | undefined[] | string[])} configuration
 * @returns {Provider[]}
 */
export function resolveProviders(
  ...configuration: ProviderReference[] | undefined[] | string[]
): Provider[] {
  // resolve default if none provided.
  if (typeof configuration === "undefined" || !configuration.length) {
    return [providers.ExchangeRateAPI];
  }

  // checking for incorrect config types
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

  // configuration is an array of providers
  // casting
  const initializationConfig = <ProviderReference[]>configuration;

  // resolving all providers
  return initializationConfig.map((provider) => resolveProvider(provider));
}
