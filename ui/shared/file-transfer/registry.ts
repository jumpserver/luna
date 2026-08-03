import type { FileTransferEndpoint } from "./types";

const endpoints = new Map<string, FileTransferEndpoint>();

export function registerFileTransferEndpoint(endpoint: FileTransferEndpoint) {
  endpoints.set(endpoint.ref.id, endpoint);
  return () => {
    if (endpoints.get(endpoint.ref.id) === endpoint) endpoints.delete(endpoint.ref.id);
  };
}

export function getFileTransferEndpoint(id: string) {
  return endpoints.get(id) || null;
}

export function clearFileTransferEndpoint(id: string) {
  endpoints.delete(id);
}
