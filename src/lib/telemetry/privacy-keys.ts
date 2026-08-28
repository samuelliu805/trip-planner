export function isProhibitedTelemetryKey(key: string): boolean {
  return /(?:address|attachments?|authorization|avatar|body|booking|cookie|coordinate|display.?name|email|(?:start|end).?date|filename|form.?values?|free.?form|headers?|itinerary.?item.?id|item.?count|item.?id|latitude|location|longitude|notes?|phone|place.?search|price|query|raw.?error|raw.?user|(?:postgres|provider|supabase).?error|schedule|share.?token|signed.?url|storage.?key|title|trip.?id|token|url$|user.?id)/i.test(
    key,
  );
}
