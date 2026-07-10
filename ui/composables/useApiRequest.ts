import type { AssetTreeKind, TokenResponse } from "~/types";

export interface ApiRequest {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  path: string
  query?: Record<string, unknown>
  body?: unknown
}

export interface AssetTreeParams {
  key?: string
  n?: string
  lv?: number
  type?: string
  category?: string
  search?: string
}

export interface FavoriteFolderPayload {
  name: string
  parent?: string | null
}

export interface SmartEndpointParams {
  protocol: string
  assetId?: string
  token?: string
}

const buildWebQuery = (request: ApiRequest) => {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  }

  return query.toString();
};

async function webApiRequest<T>(request: ApiRequest): Promise<T> {
  const query = buildWebQuery(request);
  const url = [
    withWebSitePrefix(request.path),
    query
  ].filter(Boolean).join("?");
  const hasBody = request.body !== undefined;
  const response = await fetch(url, {
    method: request.method,
    credentials: "include",
    headers: hasBody
      ? { ...getWebApiMutationHeaders(), "Content-Type": "application/json" }
      : getWebApiHeaders(),
    body: hasBody ? JSON.stringify(request.body) : undefined
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const text = await response.text();

  if (!text) {
    return null as T;
  }

  return JSON.parse(text) as T;
}

async function tauriApiRequest<T>(request: ApiRequest): Promise<T> {
  return useTauriCoreInvoke<T>("api_request", { request });
}

export async function apiRequest<T>(request: ApiRequest): Promise<T> {
  if (isTauriRuntime()) {
    return tauriApiRequest<T>(request);
  }

  return webApiRequest<T>(request);
}

export function getAssetTree(
  kind: AssetTreeKind,
  params: AssetTreeParams
): Promise<unknown> {
  const paths: Record<AssetTreeKind, string> = {
    authorization: "/api/v1/perms/users/self/nodes/children-with-assets/tree/",
    type: "/api/v1/perms/users/self/nodes/children-with-assets/category/tree/",
    search: "/api/v1/perms/users/self/assets/tree/"
  };

  return apiRequest<unknown>({
    method: "GET",
    path: paths[kind],
    query: params
  });
}

export function getFavoriteFolders(): Promise<unknown> {
  return apiRequest<unknown>({
    method: "GET",
    path: "/api/v1/assets/favorite-folders/"
  });
}

export function createFavoriteFolder(payload: FavoriteFolderPayload): Promise<unknown> {
  return apiRequest<unknown>({
    method: "POST",
    path: "/api/v1/assets/favorite-folders/",
    body: payload
  });
}

export function favoriteAssetToFolder(assetId: string, folderId: string): Promise<unknown> {
  return apiRequest<unknown>({
    method: "POST",
    path: "/api/v1/assets/favorite-assets/",
    body: {
      asset: assetId,
      folder: folderId
    }
  });
}

export function getConnectMethods(): Promise<Record<string, unknown>> {
  return apiRequest<Record<string, unknown>>({
    method: "GET",
    path: "/api/v1/terminal/components/connect-methods/"
  });
}

export function getSmartEndpoint(params: SmartEndpointParams): Promise<{ value?: string, host?: string, port?: number, https_port?: number }> {
  return apiRequest({
    method: "GET",
    path: "/api/v1/terminal/endpoints/smart/",
    query: {
      protocol: params.protocol,
      asset_id: params.assetId,
      token: params.token
    }
  });
}

export function createConnectionToken(body: unknown): Promise<TokenResponse> {
  return apiRequest<TokenResponse>({
    method: "POST",
    path: "/api/v1/authentication/connection-token/",
    body
  });
}

export function exchangeConnectionToken(tokenId: string): Promise<TokenResponse> {
  return apiRequest<TokenResponse>({
    method: "POST",
    path: "/api/v1/authentication/connection-token/exchange/",
    body: { id: tokenId }
  });
}

export function getCommandSnippets(): Promise<unknown> {
  return apiRequest<unknown>({
    method: "GET",
    path: "/api/v1/ops/adhocs/",
    query: { only_mine: true }
  });
}

export function getAssetDetailRequest(assetId: string): Promise<Record<string, any>> {
  return apiRequest<Record<string, any>>({
    method: "GET",
    path: `/api/v1/perms/users/self/assets/${encodeURIComponent(assetId)}/`
  });
}

export function renameAsset(assetId: string, name: string, orgId?: string): Promise<Record<string, any> | null> {
  return apiRequest<Record<string, any> | null>({
    method: "POST",
    path: "/api/v1/assets/my-asset/",
    body: {
      asset: assetId,
      name,
      oid: orgId || undefined
    }
  });
}

export function favoriteAsset(assetId: string): Promise<unknown> {
  return apiRequest<unknown>({
    method: "POST",
    path: "/api/v1/assets/favorite-assets/",
    body: { asset: assetId }
  });
}

export function unfavoriteAsset(assetId: string): Promise<unknown> {
  return apiRequest<unknown>({
    method: "DELETE",
    path: "/api/v1/assets/favorite-assets/",
    query: { asset: assetId }
  });
}
