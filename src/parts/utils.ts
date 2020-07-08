import { UserDefinedProvider, Provider } from "./providers";

/**
 * Utility for typechecking UserDefinedProvider objects
 *
 * @export
 * @param {(UserDefinedProvider | any)} userDefinedProvider - The UserDefinedProvider object to be checked
 * @returns {u is UserDefinedProvider}
 */
export function checkIfUserDefinedProvider(
  userDefinedProvider: UserDefinedProvider | any
): userDefinedProvider is UserDefinedProvider {
  return (
    (userDefinedProvider as UserDefinedProvider).name !== undefined &&
    checkIfProvider((userDefinedProvider as UserDefinedProvider).provider)
  );
}

/**
 * Utility for typechecking Provider objects
 *
 * @export
 * @param {(Provider | any)} provider - The Provider object to be checked
 * @returns {p is Provider}
 */
export function checkIfProvider(
  provider: Provider | any
): provider is Provider {
  return (
    (provider as Provider).endpoint !== undefined &&
    (provider as Provider).errorHandler !== undefined &&
    (provider as Provider).errors !== undefined &&
    (provider as Provider).handler !== undefined &&
    (provider as Provider).key !== undefined
  );
}
