import { AxiosInstance, AxiosResponse, AxiosRequestHeaders } from "axios";

export function response(data: any, status: number = 200): AxiosResponse {
  return {
    data,
    status,
    statusText: "",
    headers: {} as AxiosRequestHeaders,
    config: { headers: {} as AxiosRequestHeaders }
  } as AxiosResponse;
}

/** An axios-shaped HTTP failure. The requester handles these differently from an error payload in a 200 body. */
export function httpError(status: number, data: any = undefined) {
  return { response: { status, data } };
}

/** A transport failure (ECONNREFUSED, timeout, DNS) — a rejection carrying no `response`. */
export function transportError(message: string = "ECONNREFUSED") {
  return new Error(message);
}

export interface MockClient {
  client: AxiosInstance;
  get: jest.Mock;
  urls: () => string[];
  /** Throws unless exactly one request was made. */
  url: () => string;
}

/**
 * A stand-in AxiosInstance returning the given outcomes in order.
 * The last outcome repeats, so retry tests need not enumerate every attempt.
 */
export function mockClient(...outcomes: any[]): MockClient {
  const requested: string[] = [];

  const get: jest.Mock = jest.fn((url: string): Promise<any> => {
    requested.push(url);
    const outcome = outcomes[Math.min(requested.length - 1, outcomes.length - 1)];

    if (outcome instanceof Error) {
      return Promise.reject(outcome);
    }
    if (outcome && typeof outcome === "object" && "response" in outcome) {
      return Promise.reject(outcome);
    }
    return Promise.resolve(outcome);
  });

  return {
    client: { get } as unknown as AxiosInstance,
    get,
    urls: () => [...requested],
    url: () => {
      const all = [...requested];
      if (all.length !== 1) {
        throw new Error(`Expected exactly 1 request, got ${all.length}`);
      }
      return all[0];
    }
  };
}
