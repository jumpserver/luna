export function formatMessage(id: string, type: string, data: unknown) {
  return JSON.stringify({ id, type, data });
}
