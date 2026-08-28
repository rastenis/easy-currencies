/**
 * Chainable API coverage.
 *
 * `Chainer` constructs its own `Converter` internally, so there is no client to
 * inject. `Config` builds its default client with `axios.create()`, so the
 * axios module is mocked here to reach it. If a proper injection seam is added
 * later, these tests should switch to it.
 */

const get = jest.fn();

jest.mock("axios", () => {
  const instance = { get };
  return {
    __esModule: true,
    default: { create: () => instance },
    create: () => instance
  };
});

import { Convert } from "../../src/converter";

const RATES = { rates: { EUR: 0.9, GBP: 0.8 } };

function ok(data: any) {
  return Promise.resolve({ data, status: 200, statusText: "", headers: {}, config: {} });
}

beforeEach(() => {
  get.mockReset();
  get.mockImplementation(() => ok(RATES));
});

describe("Convert chain", () => {
  it("converts through the documented chain", async () => {
    const value = await Convert(15).from("USD").to("EUR");

    expect(value).toBeCloseTo(13.5, 10);
  });

  it("accepts the amount via .amount() instead of the factory", async () => {
    const value = await Convert().amount(15).from("USD").to("EUR");

    expect(value).toBeCloseTo(13.5, 10);
  });

  it("requests rates for the base currency", async () => {
    await Convert(15).from("USD").to("EUR");

    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][0]).toContain("USD");
  });

  it("exposes fetched rates and reuses them without refetching", async () => {
    const chain = await Convert(10).from("USD").fetch();

    expect(chain.rates).toEqual(RATES.rates);
    expect(get).toHaveBeenCalledTimes(1);

    const eur = await chain.to("EUR");

    // Cached rates are reused, so no second request goes out.
    expect(eur).toBeCloseTo(9, 10);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("converts to several currencies from one fetch", async () => {
    const chain = await Convert(10).from("USD").fetch();

    expect(await chain.to("EUR")).toBeCloseTo(9, 10);
    expect(await chain.to("GBP")).toBeCloseTo(8, 10);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("rejects when the target currency is absent from the rates", async () => {
    await expect(Convert(15).from("USD").to("XYZ")).rejects.toBeDefined();
  });
});
