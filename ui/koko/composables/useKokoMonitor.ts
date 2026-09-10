export async function getKokoMonitorComponent(sessionId: string, endpointUrl: string, ticket: string) {
  const url = new URL(`/koko/api/monitor/${encodeURIComponent(sessionId)}/`, endpointUrl);
  if (ticket) url.searchParams.set("ticket", ticket);
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`);
  return response.json() as Promise<{ component: "koko" | "lion" }>;
}
