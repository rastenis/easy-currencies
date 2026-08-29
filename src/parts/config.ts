import { HttpClient, createClient } from "./client";
import { RetryOptions } from "./requester";
import {
  Provider,
  providers,
  resolveProvider,
  UserDefinedProvider,
  ProviderReference
} from "./providers";

import { userDefinedProviderIssue } from "./utils";

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
    // A copy: handing back the live array lets `providers.length = 0` empty
    // the chain, the same bypass `converter.providers` already guards against.
    return [...this._active];
  }

  /**
   * Active client.
   */
  private _client: HttpClient = createClient();

  /**
   * Client setter.
   * @param client  The client.
   */
  setClient = (client: HttpClient): void => {
    this._client = client;
  };

  /**
   * Client getter.
   */
  getClient = () => {
    return this._client;
  };

  /**
   * Active retry tuning.
   */
  private _retry: RetryOptions = {};

  /**
   * Retry setter. Merges, so one field can be set without restating the rest.
   * @param options  The tuning to apply.
   */
  setRetryOptions = (options: RetryOptions): void => {
    this._retry = { ...this._retry, ...options };
  };

  /**
   * Retry getter.
   */
  getRetryOptions = (): RetryOptions => {
    return { ...this._retry };
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
      // Providers are copied per instance now, so object identity no longer
      // identifies a duplicate; the endpoint does.
      return !this._active.find(
        (a) => a === p || a.endpoint.base === p.endpoint.base
      );
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
    if (!Array.isArray(newProviders)) {
      throw new Error("Providers must be given as an array.");
    }

    // Validate the whole batch before adding any of it, so a bad entry cannot
    // leave earlier ones half-added and unusable on retry.
    newProviders.forEach((p) => {
      const issue = userDefinedProviderIssue(p);
      if (issue) {
        throw new Error(`Invalid provider format! ${issue}.`);
      }
      if (Object.prototype.hasOwnProperty.call(providers, p.name)) {
        throw new Error(
          `'${p.name}' is the name of a built-in provider; choose another.`
        );
      }
    });

    // Deliberately not written into the exported `providers` map. Doing so put
    // user API keys somewhere any code in the process could read, made two
    // libraries adding the same name collide, and let unrelated code resolve a
    // provider it never registered. Custom providers belong to this Converter.

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

    // Keyless providers are appended as fallbacks so a converter works out of
    // the box, and keeps working when one of them is down. Ordered by currency
    // coverage, widest first: Frankfurter carries only the ECB set, so it is
    // the last resort rather than the first.
    this.addProviders(
      [providers.ExchangeRateAPI, providers.FloatRates, providers.Frankfurter],
      false
    );
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
    throw new Error(
      "You must either supply nothing or a config object (see the 'config' section to see the different APIs that can be used)"
    );
  }

  // typeof null is "object", and the signature permits undefined[], so both
  // reach resolveProvider and crash there without this.
  if (configuration[0] === null || configuration[0] === undefined) {
    return [providers.ExchangeRateAPI];
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
