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

  // A zero rate used to take the "not present" branch (`if (!rate)`) and be
  // reported as a missing currency. It is present — it is just not usable.
  it("reports a zero rate as invalid, not as missing", () => {
    expect(() => rate({ EUR: 0 })).toThrow(/Invalid rate value for 'EUR'/);
    expect(() => rate({ EUR: 0 })).not.toThrow(/present in rates/);
  });

  it("reports a null rate as invalid, not as missing", () => {
    expect(() => rate({ EUR: null })).toThrow(/Invalid rate value for 'EUR'/);
    expect(() => rate({ EUR: null })).not.toThrow(/present in rates/);
  });

  // `{EUR: 0}` threw "not present" while `{EUR: "0"}` returned 0. Both are the
  // same unusable rate and must now be reported the same way.
  it("treats a numeric and a string zero identically", () => {
    const numeric = (() => {
      try {
        rate({ EUR: 0 });
      } catch (e: any) {
        return e.message;
      }
    })();
    const string = (() => {
      try {
        rate({ EUR: "0" });
      } catch (e: any) {
        return e.message;
      }
    })();

    expect(numeric).toMatch(/Invalid rate value for 'EUR'/);
    expect(string).toMatch(/Invalid rate value for 'EUR'/);
  });

  describe("rejects rates that are not a usable positive number", () => {
    // Each of these used to produce a plausible-looking wrong amount.
    it.each([
      ["a string with trailing garbage", "0.9abc"],
      ["an overflowing exponent", "1e999"],
      ["a negative rate", -0.9],
      ["a negative rate as a string", "-0.9"],
      ["an array that coerces", ["0.9"]],
      ["a boolean", true],
      ["an object", { value: 0.9 }],
      ["an empty string", ""],
      ["undefined", undefined]
    ])("%s", (_label, value) => {
      expect(() => rate({ EUR: value })).toThrow(/Invalid rate value for 'EUR'/);
    });

    it("never returns a non-finite result", () => {
      expect(() => rate({ EUR: "1e999" })).toThrow();
      expect(() => rate({ EUR: Infinity })).toThrow(/Invalid rate value/);
      expect(() => rate({ EUR: NaN })).toThrow(/Invalid rate value/);
    });
  });

  it("keeps the rate table out of the missing-currency message", () => {
    const rates: any = {};
    for (let i = 0; i < 166; i++) {
      rates[`C${i}`] = 1 + i;
    }

    let message = "";
    try {
      rate(rates, "XYZ");
    } catch (e: any) {
      message = e.message;
    }

    expect(message).toMatch(/No 'XYZ' present in rates/);
    expect(message).toContain("166 rates available");
    // The whole table used to be JSON.stringify'd into the message.
    expect(message).not.toContain("C0");
    expect(message.length).toBeLessThan(120);
  });

  it("says '1 rate' rather than '1 rates'", () => {
    expect(() => rate({ USD: 1 }, "XYZ")).toThrow(/1 rate available/);
  });

  it("rejects rates that are not an object", () => {
    expect(() => rate(null)).toThrow(/Rates must be an object/);
    expect(() => rate("0.9" as any)).toThrow(/Rates must be an object/);
    expect(() => rate(undefined)).toThrow(/Rates must be an object/);
  });

  it("throws Error objects, not bare values", () => {
    expect(() => rate({ EUR: 0 })).toThrow(Error);
    expect(() => rate({ USD: 1 })).toThrow(Error);
  });
});

describe("amount validation", () => {
  // The library used to hand back NaN, or 0, for a non-numeric amount.
  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a non-numeric string", "abc"],
    ["a numeric string", "15"],
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["-Infinity", -Infinity]
  ])("rejects %s as an amount", (_label, amount) => {
    expect(() => new Converter().convertRate(amount as any, "EUR", { EUR: 0.9 })).toThrow(
      /Conversion amount must be a finite number/
    );
  });

  it("accepts zero and negative amounts, which are legitimate", () => {
    expect(rate({ EUR: 0.9 }, "EUR", 0)).toBe(0);
    expect(rate({ EUR: 0.9 }, "EUR", -10)).toBeCloseTo(-9, 10);
  });

  it("rejects a bad amount through convert() too, before any request", async () => {
    await expect(
      new Converter().convert(NaN as any, "USD", "EUR", { EUR: 0.9 })
    ).rejects.toThrow(/Conversion amount must be a finite number/);
  });
});

describe("currency validation", () => {
  it.each([
    ["undefined", undefined],
    ["an empty string", ""],
    ["whitespace", "   "],
    ["a number", 5]
  ])("names 'from' when it is %s", async (_label, from) => {
    await expect(
      new Converter().convert(10, from as any, "EUR")
    ).rejects.toThrow(/The 'from' currency must be a non-empty string/);
  });

  it.each([
    ["undefined", undefined],
    ["an empty string", ""],
    ["whitespace", "   "]
  ])("names 'to' when it is %s", async (_label, to) => {
    await expect(
      new Converter().convert(10, "USD", to as any)
    ).rejects.toThrow(/The 'to' currency must be a non-empty string/);
  });

  it("validates before reaching the network", async () => {
    const converter = new Converter();
    const get = jest.fn();
    converter.setClient({ get });

    await expect(converter.convert(10, undefined as any, "EUR")).rejects.toThrow(
      /'from'/
    );

    expect(get).not.toHaveBeenCalled();
  });

  it("rejects a missing 'from' in getRates as well", async () => {
    await expect(new Converter().getRates("", "EUR")).rejects.toThrow(/'from'/);
  });

  it("allows an empty 'to' when fetching a whole table", async () => {
    const converter = new Converter();
    converter.setClient({
      get: async () => ({ status: 200, data: { rates: { EUR: 0.9 } } })
    });

    await expect(converter.getRates("USD", "", true)).resolves.toEqual({
      EUR: 0.9
    });
  });
});
