import axios from "axios";

export class Requester {
  /**
   * Main config object that either contains normalized credentials for an API
   * or is null, in which case requester defaults to
   *
   * @type {(Object | undefined)}
   * @memberof Requester
   */
  _config: Object | undefined = undefined;

  /**
   * Creates an instance of Requester and resolves config (if any).
   * @param {(string | Array<number>)} config - pre-formatted config value (see docs for configuration options)
   * @memberof Requester
   */
  constructor(config: Object | undefined) {
    if (typeof config !== "object" && typeof config !== "undefined") {
      throw "You must either supply nothing or a config object (see the 'config' section to see the different APIs that can be used)";
    }
    // TODO: config proxy
    this._config = undefined;
  }
}
