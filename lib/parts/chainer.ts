import { Converter } from "../converter";

export function Chainer(amount: number) {
  let _currentAmount: number | undefined = amount;
  let _currentFrom: string | undefined = undefined;
  let _currentTo: string | undefined = undefined;

  let ob = {
    get: get,
    from: from,
    to: to
  };

  return ob;

  function get(amount: number) {
    _currentAmount = amount;
    return ob;
  }

  function from(from: string) {
    _currentFrom = from;
    return ob;
  }

  async function to(to: string) {
    _currentTo = to;

    // converting

    let c = new Converter(undefined);
    let r = await c.convert(
      <number>_currentAmount,
      <string>_currentFrom,
      <string>_currentTo
    );
    return r;
  }
}
