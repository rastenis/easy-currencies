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
