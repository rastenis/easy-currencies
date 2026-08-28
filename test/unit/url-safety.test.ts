import { mockClient, response } from "../helpers/mockClient";
import { Converter } from "../../src/converter";

/**
 * Currency arguments come from the caller and land in a URL. Before this they
 * were substituted with a plain String.replace, so a value could escape its
 * slot — and `$` sequences were interpreted as replacement patterns.
 */

function urlFor(from: string, to: string = "EUR"): string {
  const converter = new Converter("ExchangeRateAPI");
  while (converter.active.length > 1) {
    converter.remove(converter.active[1]);
  }
  const mock = mockClient(response({ rates: { EUR: 0.9 } }));
  converter.config.setClient(mock.client);

  return converter
    .convert(1, from, to)
    .catch(() => undefined)
    .then(() => mock.urls()[0]) as unknown as string;
}

describe("currency arguments cannot escape their slot in the URL", () => {
  it.each([
    ["adds a query parameter", "USD&access_key=ATTACKER", "&access_key="],
    ["traverses the path", "../../../v6/latest/USD", "../"],
    ["truncates later parameters with a fragment", "USD#", "#"]
  ])("%s", async (_label, from, forbidden) => {
    const url = await urlFor(from);

    expect(url).not.toContain(forbidden);
  });

  it("does not treat $ sequences as replacement patterns", async () => {
    // "$`" means "everything before the match" to String.replace, which spliced
    // the URL prefix into the middle of the URL.
    const url = await urlFor("US$`D");

    expect(url).toBe("https://api.exchangerate-api.com/v4/latest/US%24%60D");
    expect(url.indexOf("https://")).toBe(url.lastIndexOf("https://"));
  });

  it("leaves ordinary currency codes untouched", async () => {
    expect(await urlFor("USD")).toBe(
      "https://api.exchangerate-api.com/v4/latest/USD"
    );
  });

  it("leaves longer tickers untouched", async () => {
    // Providers carry crypto codes; encoding must not mangle them.
    expect(await urlFor("USDT")).toContain("/USDT");
    expect(await urlFor("1INCH")).toContain("/1INCH");
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
