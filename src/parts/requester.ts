import { AxiosError, AxiosInstance } from "axios";
import { Provider } from "./providers";
import { _to } from "../parts/utils"

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
  client: AxiosInstance,
  provider: Provider,
  query: Query
): Promise<any> {
  const [err, result] = (await _to(client.get(formatUrl(provider, query)))) as [
    AxiosError,
    any
  ];

  // resolving error
  const error = provider.errorHandler(err ? err.response : result.data);

  // returning either the meaning of the error (if registered in provider's definition), or the error itself.
  if (error) {
    throw provider.errors[error]
      ? { handled: true, error: provider.errors[error] }
      : { handled: false, error };
  }

  return result.data;
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
