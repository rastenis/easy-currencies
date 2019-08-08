import axios from "axios";
import { Provider } from "./providers";

export interface Query {
  FROM: string;
  TO: string;
  multiple: boolean;
}

export class Requester {
  // TODO: get all if caching is enabled
  getRates = async (provider: Provider, query: Query) => {
    return new Promise(async (res, rej) => {
      try {
        let result = await axios.get(formatUrl(provider, query));
        return res(result.data);
      } catch (e) {
        return rej(e);
      }
    });
  };
}

function formatUrl(provider: Provider, query: Query): string {
  if (query.multiple) {
    return provider.endpoint.multiple
      .replace("%FROM%", query.FROM)
      .replace(provider.keyNeeded ? "%KEY%" : "", provider.key || "");
  }
  return provider.endpoint.single
    .replace("%FROM%", query.FROM)
    .replace("%TO%", query.TO)
    .replace(provider.keyNeeded ? "%KEY%" : "", provider.key || "");
}
