/** Shared structure gate permits independent days; destructive structure work takes it exclusively. */
export function browserResourceLock<T>(
  name: string,
  action: () => Promise<T>,
  resources: string[] = ["*"],
): Promise<T> {
  if (!navigator.locks) return action();
  const sorted = [...new Set(resources)].sort();
  const acquire = (index: number): Promise<T> =>
    index === sorted.length
      ? action()
      : navigator.locks.request(`${name}:resource:${sorted[index]}`, () => acquire(index + 1));
  return navigator.locks.request(
    `${name}:structure`,
    { mode: sorted.includes("*") ? "exclusive" : "shared" },
    () => acquire(0),
  );
}
