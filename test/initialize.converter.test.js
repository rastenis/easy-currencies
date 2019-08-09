const { Converter } = require("../dist");

test("Converts an amount of given currency.", async () => {
  // default initialization
  let converter = new Converter();

  let value = converter.config.active;

  console.log(value);
});
