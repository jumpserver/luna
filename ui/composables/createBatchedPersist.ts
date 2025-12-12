export interface BatchedPersistOptions {
  onEnd?: () => void
  onStart?: () => void
  onError?: (err: unknown) => void
}

export const createBatchedPersist = <T extends object>(
  patch: (partial: Partial<T>) => Promise<void>,
  options: BatchedPersistOptions = {}
) => {
  let scheduled = false;
  let hasPending = false;

  let pending: Partial<T> = {};
  let queue: Promise<void> = Promise.resolve();

  const flush = () => {
    scheduled = false;
    if (!hasPending) return;

    const current = pending;

    pending = {};
    hasPending = false;

    queue = queue
      .then(async () => {
        options.onStart?.();
        try {
          await patch(current);
        } catch (err) {
          options.onError?.(err);
        } finally {
          options.onEnd?.();
        }
      })
      .catch((err) => {
        options.onError?.(err);
      });
  };

  const enqueue = (partial: Partial<T>) => {
    pending = { ...pending, ...partial };
    hasPending = true;

    if (scheduled) return;

    scheduled = true;
    Promise.resolve().then(flush);
  };

  const drain = () => queue;

  return { enqueue, drain };
};
