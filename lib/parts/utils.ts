import { UserDefinedProvider, Provider } from "./providers";

/**
 * Utility for typechecking UserDefinedProvider objects
 *
 * @export
 * @param {(UserDefinedProvider | any)} u - The UserDefinedProvider object to be checked
 * @returns {u is UserDefinedProvider}
 */
export function checkIfUserDefinedProvider(
  u: UserDefinedProvider | any
): u is UserDefinedProvider {
  return (
    (u as UserDefinedProvider).name !== undefined &&
    checkIfProvider((u as UserDefinedProvider).provider)
  );
}

/**
 * Utility for typechecking Provider objects
 *
 * @export
 * @param {(Provider | any)} p - The Provider object to be checked
 * @returns {p is Provider}
 */
export function checkIfProvider(p: Provider | any): p is Provider {
  return (
    (p as Provider).endpoint !== undefined &&
    (p as Provider).errorHandler !== undefined &&
    (p as Provider).errors !== undefined &&
    (p as Provider).handler !== undefined &&
    (p as Provider).key !== undefined
  );
}
