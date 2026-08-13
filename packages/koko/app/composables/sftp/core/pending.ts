interface RejectablePendingRequest {
  reject: (error: Error) => void;
  timeout?: ReturnType<typeof setTimeout>;
}

export function rejectPendingRequests<T extends RejectablePendingRequest>(pendingRequests: Iterable<T>, error: Error) {
  for (const pending of pendingRequests) {
    clearTimeout(pending.timeout);
    pending.reject(error);
  }
}
