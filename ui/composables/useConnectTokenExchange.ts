import type { TokenResponse } from "~/types";

export async function exchangeConnectToken(tokenId: string): Promise<TokenResponse> {
  if (!tokenId) throw new Error("missing connection token");

  return exchangeConnectionToken(tokenId);
}
