import { format, parseISO } from "date-fns";

export function formatShareImageExpiry(expiresAt: string) {
  return format(parseISO(expiresAt), "MMM d, yyyy");
}
