const { Convert } = require("../dist");

test("Converts (chained) an amount of given currency.", async () => {
  // chainer (easy mode)
  let value = await Convert(15)
    .from("USD")
    .to("EUR");

  expect(typeof value).toBe("number");
  expect(value).toBeGreaterThan(0);
  expect(value).toBeLessThan(30);
});

test("Fetches raw rates for given currency.", async () => {
  let conv = await Convert()
    .from("USD")
    .fetch();

  // reasonable expectation for rate amount
  expect(Object.keys(conv.rates).length).toBeGreaterThan(5);
});

test("Converts (chained) an amount of given currency (cached).", async () => {
  let conv = await Convert()
    .from("USD")
    .fetch();

  let value = await conv.amount(15).to("EUR");

  expect(typeof value).toBe("number");
  expect(value).toBeGreaterThan(0);
  expect(value).toBeLessThan(30);
});
