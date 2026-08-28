import { AxiosInstance, AxiosResponse, AxiosRequestHeaders } from "axios";

/**
 * Builds a minimal AxiosResponse around a payload, so tests can describe
 * provider responses as plain data without restating axios boilerplate.
 */
export function response(data: any, status: number = 200): AxiosResponse {
  return {
    data,
    status,
    statusText: "",
    headers: {} as AxiosRequestHeaders,
    config: { headers: {} as AxiosRequestHeaders }
  } as AxiosResponse;
}

/**
 * Builds an axios-shaped rejection (an HTTP failure), which the requester
 * distinguishes from a success-shaped error payload.
 */
export function httpError(status: number, data: any = undefined) {
  return { response: { status, data } };
}

export interface MockClient {
  client: AxiosInstance;
  get: jest.Mock;
  /** URLs requested, in order. */
  urls: () => string[];
  /** The single URL requested; throws if there was not exactly one. */
  url: () => string;
}

/**
 * Creates a stand-in AxiosInstance whose `get` returns the supplied outcomes in
 * order. An outcome is either an AxiosResponse (resolved) or an object with a
 * `response` key (rejected, i.e. an HTTP failure). The last outcome repeats,
 * which keeps retry tests from having to enumerate every attempt.
 */
export function mockClient(...outcomes: any[]): MockClient {
  const requested: string[] = [];

  const get: jest.Mock = jest.fn((url: string): Promise<any> => {
    requested.push(url);
    const outcome = outcomes[Math.min(requested.length - 1, outcomes.length - 1)];

    if (outcome && typeof outcome === "object" && "response" in outcome) {
      return Promise.reject(outcome);
    }
    return Promise.resolve(outcome);
  });

  const urls = () => [...requested];

  return {
    client: { get } as unknown as AxiosInstance,
    get,
    urls,
    url: () => {
      const all = urls();
      if (all.length !== 1) {
        throw new Error(`Expected exactly 1 request, got ${all.length}`);
      }
      return all[0];
    }
  };
}
