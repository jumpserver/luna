import type { TokenResponse } from "~/types";

export async function exchangeConnectToken(tokenId: string): Promise<TokenResponse> {
  if (!tokenId) throw new Error("missing connection token");

  const response = await fetch(withWebSitePrefix("/api/v1/authentication/connection-token/exchange/"), {
    method: "POST",
    credentials: "include",
    headers: {
      ...getWebApiMutationHeaders(),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ id: tokenId })
  });

  if (!response.ok) {
    throw new Error(await response.text() || `exchange connection token failed: ${response.status}`);
  }

  return await response.json() as TokenResponse;
}
