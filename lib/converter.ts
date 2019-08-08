import { Requester } from "./parts/requester";
import { Provider } from "./parts/providers";

export class Converter {
  active: Provider[];

  constructor(providers: Provider[]) {
    this.active = providers;
  }

  // TODO: get all if caching is enabled
  convert = async (amount: number, from: string, to: string) => {
    let rates = await Requester.getRates(this.active[0], {
      FROM: from,
      TO: to,
      multiple: false
    });

    console.log(rates);

    return;
  };
}
