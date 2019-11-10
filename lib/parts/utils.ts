import { UserDefinedProvider, Provider } from "./providers";

export function checkIfUserDefinedProvider(
  u: UserDefinedProvider | any
): u is UserDefinedProvider {
  return (
    (u as UserDefinedProvider).name !== undefined &&
    checkIfProvider((u as UserDefinedProvider).provider)
  );
}

export function checkIfProvider(p: Provider | any): p is Provider {
  return (
    (p as Provider).endpoint !== undefined &&
    (p as Provider).errorHandler !== undefined &&
    (p as Provider).errors !== undefined &&
    (p as Provider).handler !== undefined &&
    (p as Provider).key !== undefined
  );
}
