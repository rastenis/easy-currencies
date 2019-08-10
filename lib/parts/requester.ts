import axios from "axios";
import { Provider } from "./providers";
import to from "await-to-js";

export interface Query {
  FROM: string;
  TO: string;
  multiple: boolean;
}

export const Requester = {
  getRates: async function getRates(
    provider: Provider,
    query: Query
  ): Promise<any> {
    let [err, result] = await to(axios.get(formatUrl(provider, query)));

    // error handling
    let error = provider.errorHandler(err ? err.response : result.data);
    if (error) {
      throw provider.errors[error];
    }

    return result.data;
  }
};

function formatUrl(provider: Provider, query: Query): string {
  if (query.multiple) {
    return (provider.endpoint.base + provider.endpoint.multiple)
      .replace("%FROM%", query.FROM)
      .replace("%KEY%", provider.key || "");
  }

  return (provider.endpoint.base + provider.endpoint.single)
    .replace("%FROM%", query.FROM)
    .replace("%TO%", query.TO)
    .replace("%KEY%", provider.key || "");
}
