import { Converter } from "../../src/converter";

/**
 * getRates used to drive its fallback from the shared, live provider list.
 * Two concurrent conversions therefore raced: the first removed the failing
 * primary, and the second — already past its own first attempt — found the
 * list had shrunk under it and gave up.
 *
 * The chain is now a per-call snapshot, so both calls fall back independently.
 */

/** Fixer rejects the key; the implicit ExchangeRateAPI fallback answers. */
function racingConverter() {
  const converter = new Converter("Fixer", "bad-key");
  expect(converter.providers).toHaveLength(2);

  const urls: string[] = [];
  converter.onError = () => {};
  converter.setClient({
    get: async (url: string) => {
      urls.push(url);
      // Yield, so both in-flight calls interleave rather than run to completion
      // one after the other.
      await new Promise((resolve) => setImmediate(resolve));

      if (url.includes("fixer.io")) {
        return { status: 200, data: { error: { code: 101 } } };
      }
      return { status: 200, data: { rates: { EUR: 0.9 } } };
    }
  });

  return { converter, urls };
}

it("serves two simultaneous conversions through the fallback", async () => {
  const { converter } = racingConverter();

  const results = await Promise.allSettled([
    converter.convert(10, "USD", "EUR"),
    converter.convert(20, "USD", "EUR")
  ]);

  // Before the fix, the second settled as
  // { status: "rejected", reason: "Invalid API key!" }.
  expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
  expect((results[0] as PromiseFulfilledResult<number>).value).toBeCloseTo(9, 10);
  expect((results[1] as PromiseFulfilledResult<number>).value).toBeCloseTo(18, 10);
});

it("removes the permanently failed provider exactly once", async () => {
  const { converter } = racingConverter();

  await Promise.all([
    converter.convert(10, "USD", "EUR"),
    converter.convert(20, "USD", "EUR")
  ]);

  expect(converter.providers).toHaveLength(1);
  expect(converter.providers[0].endpoint.base).toContain("exchangerate-api.com");
});

it("scales to more than two concurrent callers", async () => {
  const { converter } = racingConverter();

  const results = await Promise.all(
    Array.from({ length: 8 }, () => converter.convert(10, "USD", "EUR"))
  );

  expect(results).toEqual(results.map(() => expect.closeTo(9, 10)));
});
