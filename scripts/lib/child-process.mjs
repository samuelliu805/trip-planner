export function waitForChildExit(child, timeoutMs = 5_000) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);

  return new Promise((resolve) => {
    let timer;
    const finish = (exited) => {
      clearTimeout(timer);
      child.off("exit", handleExit);
      resolve(exited);
    };
    const handleExit = () => finish(true);
    child.once("exit", handleExit);
    timer = setTimeout(() => finish(false), timeoutMs);
  });
}

export async function stopChild(child, { processGroup = false } = {}) {
  const sendSignal = (signal) => {
    try {
      if (processGroup && child.pid) process.kill(-child.pid, signal);
      else child.kill(signal);
    } catch {
      // The child already exited between the state check and signal delivery.
    }
  };

  if (child.exitCode === null && child.signalCode === null) sendSignal("SIGTERM");
  let exited = await waitForChildExit(child);
  if (!exited) {
    sendSignal("SIGKILL");
    exited = await waitForChildExit(child);
  }
  child.stdout?.destroy();
  child.stderr?.destroy();
  if (!exited && child.exitCode === null && child.signalCode === null) {
    throw new Error(`Unable to stop child process ${child.pid ?? "unknown"}.`);
  }
}
