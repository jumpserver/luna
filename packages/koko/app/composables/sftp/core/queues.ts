export interface SerialTaskQueue {
  enqueue: <T>(operation: () => Promise<T>) => Promise<T>;
}

export function createSerialTaskQueue(): SerialTaskQueue {
  let queue: Promise<void> = Promise.resolve();

  return {
    enqueue<T>(operation: () => Promise<T>) {
      const result = queue.then(operation, operation);
      queue = result.then(
        () => undefined,
        () => undefined
      );
      return result;
    }
  };
}
