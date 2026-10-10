let writer: string | undefined;
export function draftWriter() {
  if (writer) return writer;
  try {
    writer = window.sessionStorage.getItem("trip-planner:draft-writer") ?? crypto.randomUUID();
    window.sessionStorage.setItem("trip-planner:draft-writer", writer);
  } catch {
    writer = crypto.randomUUID();
  }
  return writer;
}
