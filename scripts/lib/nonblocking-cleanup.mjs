/** Attempt every owned cleanup and retain the original functional failure. */
export async function finishNonblockingCheck(primaryFailure, cleanups) {
  const failures = [];
  for (const [label, cleanup] of cleanups) {
    try {
      await cleanup();
    } catch (error) {
      failures.push(new Error(label, { cause: error }));
    }
  }
  if (failures.length)
    throw new AggregateError(
      primaryFailure ? [primaryFailure, ...failures] : failures,
      "Nonblocking validation cleanup failed.",
    );
}
