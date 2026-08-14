import "server-only";

export function publicTemplateRuntimeConfig() {
  const disabledKeys = new Set(
    (process.env.PUBLIC_TEMPLATE_DISABLED_KEYS ?? "")
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean),
  );
  return {
    disabledKeys,
    runtimeEnabled: process.env.PUBLIC_TEMPLATE_RUNTIME_V1 !== "0",
  };
}
