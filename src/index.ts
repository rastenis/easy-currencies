export { Converter, Convert } from "./converter";
export { providers } from "./parts/providers";

// Types used in public signatures. Exported so consumers can name them, and so
// the API report pins their shape rather than an opaque reference.
export type { rateObject } from "./converter";
export type {
  Provider,
  ProviderErrors,
  ProviderReference,
  Providers,
  UserDefinedProvider
} from "./parts/providers";
export type { Config, ProxyConfiguration } from "./parts/config";
export type { chainableConverter } from "./parts/chainer";
