// Returns a function that only fires `fn` once per `windowMs` (keyed by tag).
// Used to stop BullMQ/ioredis from flooding logs while Redis is unreachable.
export function throttled(windowMs = 30_000): (fn: () => void) => void {
  let last = 0;
  return (fn: () => void) => {
    const now = Date.now();
    if (now - last < windowMs) return;
    last = now;
    fn();
  };
}
