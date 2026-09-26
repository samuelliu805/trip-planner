/** Keep an IATA code recognizable while giving Places enough context to find the airport. */
export function airportPlaceQuery(value: string) {
  const query = value.trim();
  return /^[A-Za-z]{3}$/.test(query) ? `${query.toUpperCase()} airport` : query;
}
