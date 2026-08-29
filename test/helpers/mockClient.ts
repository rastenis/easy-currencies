import { HttpClient, HttpError, HttpResponse } from "../../src/parts/client";

export function response(data: any, status: number = 200): HttpResponse {
  return { status, data };
}

/** An HTTP failure. The requester handles these differently from an error payload in a 200 body. */
export function httpError(status: number, data: any = undefined): HttpError {
  const err = new Error(`Request failed with status code ${status}`) as HttpError;
  err.response = { status, data };
  return err;
}

/** A transport failure (ECONNREFUSED, timeout, DNS) — an error carrying no response. */
export function transportError(code: string = "ECONNREFUSED"): HttpError {
  const err = new Error("fetch failed") as HttpError;
  err.code = code;
  return err;
}

export interface MockClient {
  client: HttpClient;
  get: jest.Mock;
  urls: () => string[];
  /** Throws unless exactly one request was made. */
  url: () => string;
}

/**
 * A stand-in HttpClient returning the given outcomes in order.
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
    return Promise.resolve(outcome);
  });

  return {
    client: { get } as HttpClient,
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
