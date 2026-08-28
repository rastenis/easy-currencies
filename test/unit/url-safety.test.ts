import { mockClient, response } from "../helpers/mockClient";
import { Converter } from "../../src/converter";

/**
 * Currency arguments and the API key come from the caller and land in a URL.
 * Two layers guard that: codes are rejected unless alphanumeric, and every
 * value is percent-encoded through a replacer function.
 */

function withMock(name: string, key?: string) {
  const converter = key === undefined ? new Converter(name) : new Converter(name, key);
  while (converter.active.length > 1) {
    converter.remove(converter.active[1]);
  }
  const mock = mockClient(response({ rates: { EUR: 0.9 }, quotes: { USDEUR: 0.9 } }));
  converter.config.setClient(mock.client);
  return { converter, mock };
}

describe("currency codes are rejected unless alphanumeric", () => {
  const convert = (from: string) => {
    const { converter } = withMock("ExchangeRateAPI");
    return converter.convert(1, from, "EUR");
  };

  it.each(["..", "../..", "USD/EUR", "USD&access_key=X", "US$`D", "USD#", "USD "])(
    "rejects %p",
    async (from) => {
      await expect(convert(from)).rejects.toThrow(/must be alphanumeric/);
    }
  );

  it("rejects a bare dot segment, which encoding cannot catch", async () => {
    // `.` is unreserved in RFC 3986, so encoding leaves ".." intact and the URL
    // parser then resolves the segment and climbs a level. Rejecting the value
    // is what closes this, not the encoding.
    expect(encodeURIComponent("..")).toBe("..");
    expect(new URL("https://h/v4/latest/" + encodeURIComponent("..")).pathname).toBe(
      "/v4/"
    );

    await expect(convert("..")).rejects.toThrow(/must be alphanumeric/);
  });

  it.each(["USD", "usd", "USDT", "1INCH", "0G", "00", "1000MOG", "SBDf"])(
    "accepts the real code %s",
    async (from) => {
      // 1INCH and 00 rule out "must start with a letter"; 00 rules out "must
      // contain a letter"; AlphaVantage publishes SBDf in mixed case.
      await expect(convert(from)).resolves.toBeDefined();
    }
  );
});

describe("values are encoded into the URL", () => {
  it("leaves an ordinary code untouched", async () => {
    const { converter, mock } = withMock("ExchangeRateAPI");

    await converter.convert(1, "USD", "EUR");

    expect(mock.url()).toBe("https://api.exchangerate-api.com/v4/latest/USD");
  });

  it("encodes an API key, which carries no charset restriction", async () => {
    // Keys are provider-issued and not validated, so encoding is what keeps one
    // from adding a parameter of its own.
    const { converter, mock } = withMock("CurrencyLayer", "k&extra=1");

    await converter.convert(1, "USD", "EUR");

    expect(mock.url()).toContain("access_key=k%26extra%3D1");
    expect(mock.url()).not.toContain("&extra=1");
  });

  it("does not treat $ sequences in a key as replacement patterns", async () => {
    // "$`" means "everything before the match" to String.replace, which would
    // splice the URL prefix into the middle of the URL.
    const { converter, mock } = withMock("CurrencyLayer", "a$`b");

    await converter.convert(1, "USD", "EUR");

    expect(mock.url().indexOf("http")).toBe(mock.url().lastIndexOf("http"));
  });
});

describe("rate lookup is independent of key order", () => {
  const rate = (rates: any) => new Converter().convertRate(1, "EUR", rates);

  it("prefers an exact match over a case-insensitive one", () => {
    expect(rate({ EUR: 2, eur: 0.5 })).toBe(2);
    expect(rate({ eur: 0.5, EUR: 2 })).toBe(2);
  });

  it("still falls back to a case-insensitive match", () => {
    expect(rate({ eur: 0.5 })).toBe(0.5);
  });
});
