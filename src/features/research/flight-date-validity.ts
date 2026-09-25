export function flightArrivalLooksLate(
  departureDate: string,
  arrivalDate: string | null | undefined,
) {
  if (!departureDate || !arrivalDate) return false;
  return (
    Date.parse(`${arrivalDate}T00:00:00Z`) - Date.parse(`${departureDate}T00:00:00Z`) >
    2 * 86_400_000
  );
}
