const { Converter } = require("../dist");

test("Converts an amount of given currency.", async () => {
  // default initialization
  let converter = new Converter();

  let value = await converter.convert(15, "USD", "EUR");

  expect(typeof value).toBe("number");
  expect(value).toBeGreaterThan(0);
  expect(value).toBeLessThan(30);
});

test("Converts (chained) an amount of given currency.", async () => {
  // chainer (easy mode)
  let value = await Convert(15)
    .from("USD")
    .to("EUR");

  expect(typeof value).toBe("number");
  expect(value).toBeGreaterThan(0);
  expect(value).toBeLessThan(30);
});
