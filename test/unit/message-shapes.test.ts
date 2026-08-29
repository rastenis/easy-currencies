import { mockClient, response } from "../helpers/mockClient";
import { Converter } from "../../src/converter";

/**
 * Error wording, pinned.
 *
 * Mutation testing could gut `describeRate` to `return undefined` and leave the
 * suite green: every test that touched a message matched loosely enough that
 * none of its branches were held down. A library's error text is the only thing
 * a consumer sees when a conversion fails, so it is worth pinning.
 */

describe("describeRate names the shape it rejected", () => {
  const converter = new Converter();

  it.each([
    ["a string, quoted so whitespace is visible", "  ", `received "  "`],
    ["a number", 0, "received 0"],
    ["null", null, "received null"],
    ["undefined", undefined, "received undefined"],
    ["a boolean", true, "received true"],
    ["an array", [1, 2], "received an array"],
    ["an object", { nested: 1 }, "received an object"]
  ])("describes %s", (_label, value, expected) => {
    expect(() => converter.convertRate(10, "EUR", { EUR: value as any })).toThrow(
      expected
    );
  });

  it("does not dump an object's fields into the message", () => {
    // The rejected value can be a whole API response, which carries the key.
    expect(() =>
      converter.convertRate(10, "EUR", { EUR: { secret: "SUPERSECRET" } as any })
    ).toThrow(/received an object/);

    try {
      converter.convertRate(10, "EUR", { EUR: { secret: "SUPERSECRET" } as any });
    } catch (e) {
      expect((e as Error).message).not.toContain("SUPERSECRET");
    }
  });
});

describe("the amount is validated before anything is requested", () => {
  it.each([
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["a string", "10"],
    ["null", null]
  ])("rejects %s without reaching the network", async (_label, amount) => {
    const converter = new Converter();
    const get = jest.fn();
    converter.setClient({ get });

    await expect(converter.convert(amount as any, "USD", "EUR")).rejects.toThrow(
      /Conversion amount must be a finite number/
    );

    // The comment promises "before anything is requested"; nothing asserted it.
    expect(get).not.toHaveBeenCalled();
  });
});

describe("getRates validates its target currency", () => {
  it("requires 'to' when it is not fetching a whole table", async () => {
    // Reachable only on a direct call: convert() pre-validates.
    await expect(new Converter().getRates("USD", "")).rejects.toThrow(
      /The 'to' currency must be a non-empty string/
    );
  });

  it("does not require 'to' when it is", async () => {
    const converter = new Converter();
    converter.config.setClient(mockClient(response({ rates: { EUR: 0.9 } })).client);

    await expect(converter.getRates("USD", "", true)).resolves.toMatchObject({
      EUR: 0.9
    });
  });
});
