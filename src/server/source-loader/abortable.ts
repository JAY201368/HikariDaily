import "server-only";

class Cancelled extends Error {}
export function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Cancelled());
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(new Cancelled()); };
    const cleanup = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    work.then((value) => { cleanup(); resolve(value); }, (error: unknown) => { cleanup(); reject(error); });
  });
}
