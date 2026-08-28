import { Converter } from "../../src/converter";

/** exchangerate-api answers 200 for "CNYqqqwwC" with CNY rates; the echoed base catches the swap. */

function converterWith(data: any) {
  const converter = new Converter("ExchangeRateAPI");
  while (converter.active.length > 1) {
    converter.remove(converter.active[1]);
  }
  converter.config.setClient({ get: async () => ({ status: 200, data }) } as any);
  return converter;
}

it("rejects when the provider answers for a different base", async () => {
  const converter = converterWith({ base: "CNY", rates: { EUR: 0.128 } });

  await expect(converter.convert(15, "CNYqqqwwC", "EUR")).rejects.toThrow(
    /answered for base 'CNY'.*requested 'CNYqqqwwC'/
  );
});

it("accepts an echoed base that differs only in case", async () => {
  const converter = converterWith({ base: "USD", rates: { EUR: 0.9 } });

  await expect(converter.convert(15, "usd", "EUR")).resolves.toBeCloseTo(13.5, 10);
});

it("accepts a response that echoes no base at all", async () => {
  const converter = converterWith({ rates: { EUR: 0.9 } });

  await expect(converter.convert(15, "USD", "EUR")).resolves.toBeCloseTo(13.5, 10);
});

it("compares against `source` when a provider uses that name", async () => {
  const converter = converterWith({ source: "CNY", rates: { EUR: 0.128 } });

  await expect(converter.convert(15, "USD", "EUR")).rejects.toThrow(
    /answered for base 'CNY'/
  );
});
