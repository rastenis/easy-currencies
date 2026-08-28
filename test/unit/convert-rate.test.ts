import { Converter, RATES_BASE } from "../../src/converter";

/** convertRate is pure: it takes pre-fetched rates and never touches the network. */
const rate = (rates: any, to: string = "EUR", amount: number = 15) =>
  new Converter().convertRate(amount, to, rates);

describe("rate base guard", () => {
  const tagged = (base: string, rates: any) => {
    Object.defineProperty(rates, RATES_BASE, { value: base, enumerable: false });
    return rates;
  };

  it("rejects rates fetched for a different base currency", async () => {
    const rates = tagged("USD", { EUR: 0.9 });

    await expect(
      new Converter().convert(100, "JPY", "EUR", rates)
    ).rejects.toThrow(/fetched for base 'USD'.*asked for 'JPY'/);
  });

  it("accepts rates whose base matches, case-insensitively", async () => {
    const rates = tagged("USD", { EUR: 0.9 });

    await expect(
      new Converter().convert(100, "usd", "EUR", rates)
    ).resolves.toBeCloseTo(90, 10);
  });

  it("accepts hand-built rates, which carry no base", async () => {
    await expect(
      new Converter().convert(10, "USD", "EUR", { EUR: 0.9 })
    ).resolves.toBeCloseTo(9, 10);
  });

  it("does not expose the marker through Object.keys or JSON", () => {
    const rates = tagged("USD", { EUR: 0.9 });

    expect(Object.keys(rates)).toEqual(["EUR"]);
    expect(JSON.parse(JSON.stringify(rates))).toEqual({ EUR: 0.9 });
  });
});

describe("convertRate", () => {
  it("multiplies by a numeric rate", () => {
    expect(rate({ EUR: 0.9 })).toBeCloseTo(13.5, 10);
  });

  it("accepts a rate supplied as a string", () => {
    expect(rate({ EUR: "0.9" })).toBeCloseTo(13.5, 10);
  });

  it("matches the target currency case-insensitively", () => {
    expect(rate({ eur: 0.9 }, "EUR")).toBeCloseTo(13.5, 10);
    expect(rate({ EUR: 0.9 }, "eur")).toBeCloseTo(13.5, 10);
  });

  it("rejects a non-numeric rate", () => {
    expect(() => rate({ EUR: "abc" })).toThrow(/Invalid rate value/);
  });

  it("reports a missing currency", () => {
    expect(() => rate({ USD: 1 })).toThrow(/No 'EUR' present in rates/);
  });

  it("throws when rates are absent entirely", () => {
    expect(() => rate(undefined)).toThrow();
  });

  // Known defect: a zero or null rate takes the "not present" branch
  // (`if (!rate)`), so a legitimate zero rate reports a misleading error.
  it("misreports a zero rate as missing", () => {
    expect(() => rate({ EUR: 0 })).toThrow(/No 'EUR' present in rates/);
  });

  it("misreports a null rate as missing", () => {
    expect(() => rate({ EUR: null })).toThrow(/No 'EUR' present in rates/);
  });
});
