/**
 * Provider list
 */
const providers = {
  ExchangeRatesAPI: { keyName: "", endpoint: "" },
  OpenExchangeRates: { keyName: "", endpoint: "" },
  Fixer: { keyName: "", endpoint: "" },
  IBAN: { keyName: "", endpoint: "" },
  CurrencyLayer: { keyName: "", endpoint: "" },
  Happi: { keyName: "", endpoint: "" }
};

/**
 * Normalized config.
 *
 * @interface config
 */
interface config {
  key: any;
  provider: object;
}

/**
 * Interface for the format of data passed in to the module initially.
 *
 * @interface initializationConfig
 */
interface initializationConfig {
  key: any;
  provider: string;
}

export class Config {
  __config: config;

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
  if (typeof configuration === "undefined") {
    return {
      key: undefined,
      provider: providers.ExchangeRatesAPI
    };
  }

  let resolvedConfig = {
    key: configuration.key,
    provider: providers[configuration.provider]
  };

  return <config>resolvedConfig;
}
