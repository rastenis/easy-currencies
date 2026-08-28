import { HttpClient, HttpError, HttpResponse } from "./client";
import { Provider } from "./providers";
import { _to, sleep } from "../parts/utils"

/**
 * Query interface, used to interact with the requester.
 *
 * @export
 * @interface Query
 */
export interface Query {
  FROM: string;
  TO: string;
  multiple: boolean;
}


/**
 * The fetchRates function, used for fetching currency conversion rates.
 *
 * @export
 * @param {AxiosInstance} client - client to be used for the request
 * @param {Provider} provider - provider from which the quotes will be fetched
 * @param {Query} query - the query
 * @returns {Promise<any>} - a result promise
 */
export async function fetchRates(
  client: HttpClient,
  provider: Provider,
  query: Query
): Promise<any> {
  const maxRetries = 5;
  let attempt = 0;
  let delay = 1000; // initial delay in ms

  while (true) {
    const [err, result] = (await _to(client.get(formatUrl(provider, query)))) as [
      HttpError,
      HttpResponse
    ];

    if (err?.response?.status === 429) {
      if (attempt >= maxRetries) {
        throw { handled: false, error: "Too many 429 responses, giving up." };
      }
      const jitter = Math.random() * 1000; // jitter between 0 and 1000ms
      await sleep(delay + jitter);
      attempt++;
      delay *= 2;
      continue;
    }

    // A transport failure — DNS, refused, timeout, abort — carries no response
    // to inspect. Marked handled so the caller falls back to the next provider
    // rather than surfacing a network blip as a fatal error.
    if (err && !err.response) {
      throw { handled: true, error: transportError(err) };
    }

    // resolving error
    const error = provider.errorHandler(err ? err.response : result.data);

    // returning either the meaning of the error (if registered in provider's definition), or the error itself.
    if (error) {
      throw provider.errors[error]
        ? { handled: true, error: provider.errors[error] }
        : { handled: false, error };
    }

    // An HTTP failure the provider does not recognise still failed. Falling
    // through here would read .data off an undefined result.
    if (err) {
      throw { handled: true, error: transportError(err) };
    }

    return result.data;
  }
}

/**
 * Reduces a request error to a message and code.
 *
 * The underlying error can carry the request URL, which embeds the provider API
 * key. Callers log these errors, so returning the original would write
 * credentials to the consumer's logs.
 *
 * @param {HttpError} err - the request error
 * @returns {Error} - an error safe to log
 */
function transportError(err: HttpError): Error {
  const status = err.response?.status;
  const detail = status ? `HTTP ${status}` : err.code || err.message || String(err);
  const error = new Error(`Request to the provider failed: ${detail}`);
  (error as any).code = err.code;
  return error;
}

/**
 * URL formatting function
 *
 * @param {Provider} provider - provider against which the request will be executed
 * @param {Query} query - the query
 * @returns {string} - formatted GET url string.
 */
function formatUrl(provider: Provider, query: Query): string {
  // if (query.multiple) {
  //   return (provider.endpoint.base + provider.endpoint.multiple)
  //     .replace("%FROM%", query.FROM)
  //     .replace("%KEY%", provider.key || "");
  // }

  // inserting base currency, final currency, and key (if needed)
  return (provider.endpoint.base + provider.endpoint.single)
    .replace("%FROM%", query.FROM)
    .replace("%TO%", query.TO)
    .replace("%KEY%", provider.key || "");
}
