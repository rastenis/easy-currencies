import { Requester } from "./parts/requester";
import { Provider } from "./parts/providers";

export class Converter {
  active: Provider[];

  constructor(providers: Provider[]) {
    this.active = providers;
  }

  // TODO: get all if caching is enabled
  convert = async (amount: number, from: string, to: string) => {
    const provider = this.active[0];

    let rates = <any>await Requester.getRates(provider, {
      FROM: from,
      TO: to,
      multiple: false
    });

    // handling response
    rates = provider.handler(rates.data);

    return amount * rates[to];
  };
}
