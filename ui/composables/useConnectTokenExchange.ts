import type { TokenResponse } from "~/types";

export async function exchangeConnectToken(tokenId: string): Promise<TokenResponse> {
  if (!tokenId) throw new Error("missing connection token");
  const token = await exchangeConnectionToken(tokenId, true);
  const pending = useAclDialog().request(token, {
    orgId: token.org_id,
    assetName: token.asset_display || tokenId
  });
  const approved = pending ? await pending : token;
  if (!approved?.is_active) throw new Error("Connection checks were cancelled or incomplete");
  return approved;
}
