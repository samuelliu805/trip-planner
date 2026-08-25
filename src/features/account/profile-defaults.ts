function conciseCity(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, 120);
}

/** Only use explicit city-like identity metadata; never guess a city from a timezone or trip. */
export function inferredHomeCity(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
  const values = metadata as Record<string, unknown>;
  for (const key of ["home_city", "base_city", "city"]) {
    const city = conciseCity(values[key]);
    if (city) return city;
  }

  const address = values.address;
  if (address && typeof address === "object" && !Array.isArray(address)) {
    return conciseCity((address as Record<string, unknown>).city);
  }
  return "";
}
