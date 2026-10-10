/**
 * Sends changes to the server in the background, one request at a time per item.
 *
 * If several changes to the same item arrive while a request is in flight (e.g. "Solve all"
 * finishing questions quickly), only the latest is sent next, so an older save can never
 * overwrite a newer one and a delete can't be undone by a save that was still queued.
 */
export function createSyncQueue(onError) {
  const slots = new Map(); // key -> { pending: task | null }

  function enqueue(key, task) {
    const slot = slots.get(key);
    if (slot) {
      slot.pending = task;
      return;
    }
    const s = { pending: null };
    slots.set(key, s);
    (async () => {
      let next = task;
      while (next) {
        try {
          await next();
        } catch (err) {
          onError(err);
        }
        next = s.pending;
        s.pending = null;
      }
      slots.delete(key);
    })();
  }

  /** Drops queued (not yet started) changes whose key starts with the prefix. */
  function dropPending(prefix) {
    for (const [key, slot] of slots) if (key.startsWith(prefix)) slot.pending = null;
  }

  return { enqueue, dropPending, busy: () => slots.size > 0 };
}
