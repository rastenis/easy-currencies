import { fetchRates, Query } from "./requester";
import { AxiosInstance, AxiosResponse, AxiosRequestHeaders } from "axios";
import { Provider } from "./providers";
import { sleep } from "../parts/utils";

// Mock sleep to resolve immediately
jest.mock("../parts/utils", () => {
  const actual = jest.requireActual("../parts/utils");
  return {
    ...actual,
    sleep: jest.fn(() => Promise.resolve())
  };
});

describe("fetchRates", () => {
  const query: Query = { FROM: "USD", TO: "EUR", multiple: false };

  const provider: Provider = {
    endpoint: { base: "https://api.example.com", single: "/rate", multiple: "/rates" },
    key: "dummy-key",
    errorHandler: (res: any) => res && res.status === 429 ? "rateLimit" : null,
    errors: { rateLimit: "Too many requests" },
    handler: jest.fn() // Added missing "handler" property
  };

  let client: AxiosInstance;
  let getMock: jest.Mock;

  beforeEach(() => {
    getMock = jest.fn();
    client = { get: getMock } as unknown as AxiosInstance;
    jest.clearAllMocks();
  });

  it("should return data on a successful fetch", async () => {
    const mockResponse: AxiosResponse = {
      data: { rate: 123 },
      status: 200,
      statusText: "",
      headers: {} as AxiosRequestHeaders, // casting headers
      config: { headers: {} as AxiosRequestHeaders } // casting config.headers
    };
    // Simulate successful call on first try
    getMock.mockResolvedValueOnce(mockResponse);

    const result = await fetchRates(client, provider, query);
    expect(result).toEqual({ rate: 123 });
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it("should retry on 429 and eventually succeed", async () => {
    const mock429Error = { response: { status: 429 } };
    const mockResponse: AxiosResponse = {
      data: { rate: 456 },
      status: 200,
      statusText: "",
      headers: {} as AxiosRequestHeaders, // casting headers
      config: { headers: {} as AxiosRequestHeaders } // casting config.headers
    };

    // First call rejects with 429, second call succeeds.
    getMock
      .mockRejectedValueOnce(mock429Error)
      .mockResolvedValueOnce(mockResponse);

    const result = await fetchRates(client, provider, query);
    expect(result).toEqual({ rate: 456 });
    expect(getMock).toHaveBeenCalledTimes(2);
    // Verify that sleep was called in retry
    expect(sleep).toHaveBeenCalled();
  });
});
