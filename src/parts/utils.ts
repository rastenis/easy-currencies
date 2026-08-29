import { UserDefinedProvider, Provider } from "./providers";

/**
 * Checks a candidate Provider and names the first thing wrong with it, or
 * returns null if it is well-formed.
 *
 * A plain `!== undefined` check let `endpoint: null` and similar garbage
 * through, so `addProviders` crashed on `p.endpoint.base` with a raw
 * TypeError instead of the library's own "Invalid provider format!". This
 * checks the actual shape each field is dereferenced with, and returns the
 * reason so the caller can throw one message that names it.
 */
export function providerShapeIssue(provider: unknown): string | null {
  if (provider === null || typeof provider !== "object") {
    return "provider must be an object";
  }
  const p = provider as Provider;
  if (
    p.endpoint === null ||
    typeof p.endpoint !== "object" ||
    typeof p.endpoint.base !== "string" ||
    typeof p.endpoint.single !== "string"
  ) {
    return "'endpoint' must be an object with string 'base' and 'single'";
  }
  if (typeof p.handler !== "function") {
    return "'handler' must be a function";
  }
  if (p.errors === null || typeof p.errors !== "object") {
    return "'errors' must be an object";
  }
  if (typeof p.errorHandler !== "function") {
    return "'errorHandler' must be a function";
  }
  // `key` is deliberately not required: keyless providers are legitimate, and
  // requiring it rejected every built-in provider.
  return null;
}

/**
 * Same as `providerShapeIssue`, for the `{ name, provider }` pair `add` and
 * `addMultiple` take.
 *
 * `name` used to be checked with `!== undefined`, so `Object.create(null)` (an
 * object, not undefined) passed here and then crashed converting it to a
 * property key for the built-in-name lookup, with no `toString` to fall back
 * on.
 */
export function userDefinedProviderIssue(
  userDefinedProvider: unknown
): string | null {
  if (userDefinedProvider === null || typeof userDefinedProvider !== "object") {
    return "provider entry must be an object";
  }
  const u = userDefinedProvider as UserDefinedProvider;
  if (typeof u.name !== "string") {
    return "'name' must be a string";
  }
  return providerShapeIssue(u.provider);
}

/**
 * Utility for typechecking UserDefinedProvider objects
 *
 * @export
 * @param {(UserDefinedProvider | any)} userDefinedProvider - The UserDefinedProvider object to be checked
 * @returns {u is UserDefinedProvider}
 */
export function checkIfUserDefinedProvider(
  userDefinedProvider: unknown
): userDefinedProvider is UserDefinedProvider {
  return userDefinedProviderIssue(userDefinedProvider) === null;
}

/**
 * Utility for typechecking Provider objects
 *
 * @export
 * @param {(Provider | any)} provider - The Provider object to be checked
 * @returns {p is Provider}
 */
export function checkIfProvider(
  provider: unknown
): provider is Provider {
  return providerShapeIssue(provider) === null;
}


/**
 * Wraps a promise and handles both the resolved value and any potential errors.
 * @param promise - The promise to wrap.
 * @returns A promise that resolves to a tuple containing the error (if any) and the resolved value (if any).
 */
export function _to<T, U = Error>(
  promise: Promise<T>,
): Promise<[U | null, T | null]> {
  return promise
    .then((data: T): [null, T] => [null, data])
    .catch((err: U): [U, null] => [err, null]);
}


/**
 * Delays execution by the specified amount of time.
 *
 * @param ms - The number of milliseconds to wait.
 * @returns A promise that resolves after the specified delay.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
