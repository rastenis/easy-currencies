import { mockClient, response } from "../helpers/mockClient";
import { Converter } from "../../src/converter";

/**
 * Edges found by property-based fuzzing. Each one returned a wrong number, or
 * abandoned a healthy provider, rather than failing honestly.
 */

describe("a rate is a decimal number", () => {
  const converter = new Converter();

  it.each([
    ["hex", "0x10"],
    ["binary", "0b11"],
    ["octal", "0o17"],
    ["a bare sign", "+"],
    ["Infinity", "Infinity"]
  ])("refuses %s as a rate", (_label, raw) => {
    // Number("0x10") is 16, so this used to convert at a rate nobody quoted.
    expect(() => converter.convertRate(10, "EUR", { EUR: raw })).toThrow(
      /Invalid rate value/
    );
  });

  it.each([
    ["a plain decimal string", "0.9", 9],
    ["a padded string", "  0.9  ", 9],
    ["exponent notation", "9e-1", 9],
    ["a leading dot", ".9", 9]
  ])("still accepts %s, which real vendors send", (_label, raw, expected) => {
    expect(converter.convertRate(10, "EUR", { EUR: raw })).toBeCloseTo(expected, 10);
  });
});

describe("a rate table is a plain object", () => {
  it("refuses an array", () => {
    // Object.keys([0.9]) is ["0"], so an array offered index-keyed currencies.
    expect(() => new Converter().convertRate(10, "EUR", [0.9] as any)).toThrow(
      /Rates must be an object/
    );
  });
});

describe("currency lookup folds case as ASCII, not Unicode", () => {
  it("does not answer 'K' from the Kelvin sign", () => {
    // "K".toLowerCase() === "k", so this table used to answer for K.
    expect(() =>
      new Converter().convertRate(10, "K", { "K": 5 } as any)
    ).toThrow(/No 'K' present in rates/);
  });

  it("still matches an ordinary lower-case key", () => {
    expect(new Converter().convertRate(10, "EUR", { eur: 0.9 })).toBeCloseTo(9, 10);
  });
});

describe("a throwing onError does not abandon the chain", () => {
  it("falls back when the reporter throws", async () => {
    const converter = new Converter();
    // The default reporter is console.error, which throws on a closed stdout:
    // a CLI piped into `head` hits exactly this.
    converter.onError = () => {
      throw new Error("EPIPE: broken pipe");
    };
    const mock = mockClient(
      response({ nonsense: true }),
      response({ rates: { EUR: 0.9 } })
    );
    converter.config.setClient(mock.client);

    await expect(converter.convert(10, "USD", "EUR")).resolves.toBeCloseTo(9, 10);
    expect(mock.urls().length).toBeGreaterThan(1);
  });

  it("still surfaces the conversion failure when every provider fails", async () => {
    const converter = new Converter();
    converter.onError = () => {
      throw new Error("EPIPE: broken pipe");
    };
    converter.config.setClient(mockClient(response({ nonsense: true })).client);

    // The reporter's failure must not become the reported failure.
    await expect(converter.convert(10, "USD", "EUR")).rejects.toThrow(
      /no usable rates/
    );
  });
});
