import axios from "axios";
import { Provider } from "./providers";

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
    try {
      let result = await axios.get(formatUrl(provider, query));

      // error handling
      let error = provider.errorHandler(result.data);
      if (error) {
        return provider.errors[error];
      }

      return result.data;
    } catch (e) {
      let error = provider.errorHandler(e.response);
      return provider.errors[error];
    }
  }
};

function formatUrl(provider: Provider, query: Query): string {
  if (query.multiple) {
    return (provider.endpoint.base + provider.endpoint.multiple)
      .replace("%FROM%", query.FROM)
      .replace(provider.keyNeeded ? "%KEY%" : "", provider.key || "");
  }

  return (provider.endpoint.base + provider.endpoint.single)
    .replace("%FROM%", query.FROM)
    .replace("%TO%", query.TO)
    .replace(provider.keyNeeded ? "%KEY%" : "", provider.key || "");
}
