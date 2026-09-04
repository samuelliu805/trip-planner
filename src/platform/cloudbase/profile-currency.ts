export const cloudBaseCnDefaultCurrency = "CNY";

export function explicitCloudBaseCurrency(value: unknown, isExplicit: unknown) {
  if (typeof value !== "string") return null;
  // Before the explicitness flag existed, only USD could be the system-written default.
  // Preserve every other stored currency, while a newly deliberate USD is marked explicit.
  return isExplicit === true || value !== "USD" ? value : null;
}
