import { Requester } from "./parts/requester";
import { Config, initializationConfig } from "./parts/config";

export class Converter {
  config: Config;

  constructor(configuration: initializationConfig) {
    this.config = new Config(configuration);
  }

  convert = (amount: number, from: string, to: string) => {};
}
