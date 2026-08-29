export { Converter, Convert, RATES_BASE_KEY } from "./converter";
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
export type { Config } from "./parts/config";
export type { HttpClient, HttpResponse, HttpError, ClientOptions } from "./parts/client";
export { createClient } from "./parts/client";
export type { chainableConverter } from "./parts/chainer";
