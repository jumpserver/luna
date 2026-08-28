import type { AssetTreeKind, TokenResponse, UserProfile } from "~/types";
import { desktopInvoke } from "~/shared/desktop/bridge";
import { useUserInfoStore } from "~/store/modules/userInfo";

export interface ApiRequest {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS";
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
  orgId?: string;
}

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public data: any
  ) {
    super(typeof data === "string" ? data : data?.detail || data?.code || `HTTP ${status}`);
    this.name = "ApiRequestError";
  }
}

export interface AssetTreeParams {
  key?: string;
  n?: string;
  lv?: number;
  type?: string;
  category?: string;
  search?: string;
}

export interface FavoriteFolderPayload {
  name: string;
  parent?: string | null;
}

export interface SmartEndpointParams {
  protocol: string;
  assetId?: string;
  token?: string;
}

export interface SqlSnippetPayload {
  name: string;
  args: string;
  module: string;
}

export interface SqlSnippetListParams extends Record<string, unknown> {
  module: string;
  limit: number;
  offset: number;
  order: string;
}

export interface CommandSnippetPayload extends SqlSnippetPayload {
  comment?: string;
}

export interface PublicSettings {
  SECURITY_COMMAND_EXECUTION?: boolean;
  SECURITY_WATERMARK_ENABLED?: boolean;
  SECURITY_WATERMARK_CONSOLE_CONTENT?: string;
  SECURITY_WATERMARK_SESSION_CONTENT?: string;
  SECURITY_WATERMARK_WIDTH?: number;
  SECURITY_WATERMARK_HEIGHT?: number;
  SECURITY_WATERMARK_FONT_SIZE?: number;
  SECURITY_WATERMARK_COLOR?: string;
  SECURITY_WATERMARK_ROTATE?: number;
}

let lastAuthFailureAt = 0;

const isAuthFailure = (error: unknown) => {
  if (error instanceof ApiRequestError) return error.status === 401;
  const message = error instanceof Error ? error.message : String(error || "");
  return ["HTTP 401", "missing current api session", "status=401"].some((needle) => message.includes(needle));
};

const handleApiAuthFailure = () => {
  if (!import.meta.client) return;

  const now = Date.now();
  if (now - lastAuthFailureAt < 1500) return;
  lastAuthFailureAt = now;

  const userInfoStore = useUserInfoStore();
  if (!userInfoStore.loggedIn) return;

  userInfoStore.setUserLoggedIn(false);
  useEventBus().emit("clearAssets", undefined);
  if (isDesktopRuntime()) {
    useEventBus().emit("login", undefined);
  } else {
    redirectToWebLogin();
  }
};

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
  const url = [withWebSitePrefix(request.path), query].filter(Boolean).join("?");
  const hasBody = request.body !== undefined;
  const response = await fetch(url, {
    method: request.method,
    credentials: "include",
    headers: hasBody
      ? { ...getWebApiMutationHeaders(request.orgId), "Content-Type": "application/json" }
      : getWebApiHeaders(request.orgId),
    body: hasBody ? JSON.stringify(request.body) : undefined
  });

  const text = await response.text();
  let data: any = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    throw new ApiRequestError(response.status, data);
  }

  if (!text) {
    return null as T;
  }

  return data as T;
}

async function desktopApiRequest<T>(request: ApiRequest): Promise<T> {
  try {
    return await desktopInvoke<T>("api_request", { request });
  } catch (error) {
    if (error && typeof error === "object" && !(error instanceof Error)) {
      const payload = error as { status?: unknown; data?: unknown; body?: unknown; message?: unknown };
      const status = Number(payload.status);
      if (Number.isFinite(status)) {
        throw new ApiRequestError(status, parseErrorData(payload.data ?? payload.body));
      }
    }

    const message =
      error instanceof Error
        ? error.message
        : error && typeof error === "object" && "message" in error
          ? String(error.message || "")
          : String(error || "");
    const match = message.match(/api request failed: status=(\d+), body=([\s\S]*)/);
    if (!match) {
      const payload = parseErrorData(message);
      if (payload && typeof payload === "object") {
        const status = Number((payload as { status?: unknown }).status);
        const data =
          (payload as { data?: unknown; body?: unknown; error?: unknown }).data ??
          (payload as { body?: unknown }).body ??
          (payload as { error?: unknown }).error;
        if (Number.isFinite(status)) throw new ApiRequestError(status, parseErrorData(data));
      }
      throw error;
    }
    throw new ApiRequestError(Number(match[1]), parseErrorData(match[2]));
  }
}

function parseErrorData(data: unknown) {
  let parsed = data;
  for (let depth = 0; depth < 2 && typeof parsed === "string"; depth++) {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      break;
    }
  }
  return parsed;
}

export async function apiRequest<T>(request: ApiRequest): Promise<T> {
  try {
    if (isDesktopRuntime()) {
      return await desktopApiRequest<T>(request);
    }

    return await webApiRequest<T>(request);
  } catch (error) {
    if (isAuthFailure(error)) {
      handleApiAuthFailure();
    }
    throw error;
  }
}

export function getAssetTree(kind: AssetTreeKind, params: AssetTreeParams, orgId?: string): Promise<unknown> {
  const paths: Record<AssetTreeKind, string> = {
    authorization: "/api/v1/perms/users/self/nodes/children-with-assets/tree/",
    type: "/api/v1/perms/users/self/nodes/children-with-assets/category/tree/",
    search: "/api/v1/perms/users/self/assets/tree/"
  };

  return apiRequest<unknown>({
    method: "GET",
    path: paths[kind],
    query: params as Record<string, unknown>,
    orgId
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

export function getFavoriteAssets(): Promise<unknown> {
  return apiRequest<unknown>({
    method: "GET",
    path: "/api/v1/assets/favorite-assets/"
  });
}

export function updateFavoriteFolder(id: string, payload: FavoriteFolderPayload): Promise<unknown> {
  return apiRequest<unknown>({
    method: "PATCH",
    path: `/api/v1/assets/favorite-folders/${id}/`,
    body: payload
  });
}

export function deleteFavoriteFolder(id: string): Promise<unknown> {
  return apiRequest<unknown>({
    method: "DELETE",
    path: `/api/v1/assets/favorite-folders/${id}/`
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

export function getPublicSettings(): Promise<PublicSettings> {
  return apiRequest<PublicSettings>({
    method: "GET",
    path: "/api/v1/settings/public/"
  });
}

export function getUserProfile(): Promise<UserProfile> {
  return apiRequest<UserProfile>({
    method: "GET",
    path: "/api/v1/users/profile/",
    query: {
      fields: [
        "id",
        "name",
        "username",
        "email",
        "avatar_url",
        "phone",
        "wechat",
        "source",
        "mfa_level",
        "mfa_enabled",
        "is_active",
        "is_valid",
        "is_expired",
        "date_joined",
        "last_login",
        "date_expired",
        "system_roles",
        "org_roles"
      ].join(",")
    }
  });
}

export function getSmartEndpoint(
  params: SmartEndpointParams,
  orgId?: string
): Promise<{ value?: string; host?: string; port?: number; https_port?: number }> {
  return apiRequest({
    method: "GET",
    path: "/api/v1/terminal/endpoints/smart/",
    query: {
      protocol: params.protocol,
      asset_id: params.assetId,
      token: params.token
    },
    orgId
  });
}

export function createConnectionToken(
  body: unknown,
  orgId?: string,
  options: { createTicket?: boolean; faceVerify?: boolean; faceMonitorToken?: string } = {}
): Promise<TokenResponse> {
  const query: Record<string, unknown> = {};
  if (options.createTicket) query.create_ticket = 1;
  if (options.faceVerify) query.face_verify = 1;
  if (options.faceMonitorToken) query.face_monitor_token = options.faceMonitorToken;

  return apiRequest<TokenResponse>({
    method: "POST",
    path: "/api/v1/authentication/connection-token/",
    ...(Object.keys(query).length > 0 ? { query } : {}),
    body,
    orgId
  });
}

export function getFaceVerifyState(
  token: string
): Promise<{ is_finished: boolean; success: boolean; error_message?: string }> {
  return apiRequest({
    method: "GET",
    path: "/api/v1/authentication/face/context/",
    query: { token }
  });
}

export function getLocalClientUrl(tokenId: string, query?: Record<string, unknown>): Promise<{ url: string }> {
  return apiRequest<{ url: string }>({
    method: "GET",
    path: `/api/v1/authentication/connection-token/${encodeURIComponent(tokenId)}/client-url/`,
    query
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

export function getCommandSnippetVariableForm(adhocId: string): Promise<unknown> {
  return apiRequest<unknown>({
    method: "OPTIONS",
    path: "/api/v1/ops/variables/form-data/",
    query: { adhoc: adhocId, t: Date.now() }
  });
}

export function createCommandSnippet(payload: CommandSnippetPayload): Promise<unknown> {
  return apiRequest<unknown>({
    method: "POST",
    path: "/api/v1/ops/adhocs/",
    body: payload
  });
}

export function updateCommandSnippet(id: string, payload: CommandSnippetPayload): Promise<unknown> {
  return apiRequest<unknown>({
    method: "PATCH",
    path: `/api/v1/ops/adhocs/${encodeURIComponent(id)}/`,
    body: payload
  });
}

export function getSqlSnippets(query: SqlSnippetListParams): Promise<unknown> {
  return apiRequest<unknown>({
    method: "GET",
    path: "/api/v1/ops/adhocs/",
    query
  });
}

export function createSqlSnippet(payload: SqlSnippetPayload): Promise<unknown> {
  return apiRequest<unknown>({
    method: "POST",
    path: "/api/v1/ops/adhocs/",
    body: payload
  });
}

export function deleteSqlSnippet(id: string): Promise<unknown> {
  return apiRequest<unknown>({
    method: "DELETE",
    path: `/api/v1/ops/adhocs/${encodeURIComponent(id)}/`
  });
}

export function getAssetDetailRequest(assetId: string, orgId?: string): Promise<Record<string, any>> {
  return apiRequest<Record<string, any>>({
    method: "GET",
    path: `/api/v1/perms/users/self/assets/${encodeURIComponent(assetId)}/`,
    orgId
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
