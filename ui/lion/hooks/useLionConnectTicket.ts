import { isTauriRuntime } from "~/utils/runtime";

export async function createLionConnectTicket(baseUrl: string, tokenId = "") {
  const { createKokoTicket } = useWorkspaceConnectors();

  try {
    const result = await createKokoTicket({ baseUrl, tokenId });
    if (result.ticket) return String(result.ticket);
  } catch (error) {
    if (!isTauriRuntime()) {
      console.warn("[lion] connect ticket unavailable, falling back to cookie authentication", error);
    }
  }

  if (!isTauriRuntime()) return "";
  const result = await useTauriCoreInvoke<{ ticket?: string }>("create_koko_connect_ticket", {
    baseUrl,
    tokenId
  });
  if (!result.ticket) throw new Error("Koko did not return a Lion connect ticket");
  return String(result.ticket);
}
