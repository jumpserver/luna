import { apiRequest } from "@/composables/useApiRequest";
import { withLionUrl } from "@/lion/utils/base";

export interface SuggestionUser {
  id: string;
  name: string;
  username: string;
}

export interface SuggestionUserPage {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results: SuggestionUser[];
}

export interface ShareApiResponse {
  success?: boolean;
  message?: string;
  id?: string;
  verify_code?: string;
  [key: string]: unknown;
}

export interface ShareSessionResponse extends ShareApiResponse {
  action_permission?: {
    value?: string;
  };
  session?: {
    id?: string;
    [key: string]: unknown;
  };
}

export interface LionRequestAuth {
  ticket?: string;
  token?: string;
}

const withRequestAuth = (url: string, auth?: LionRequestAuth) => {
  if (!auth?.ticket && !auth?.token) return url;
  const target = new URL(url, window.location.origin);
  if (auth.ticket) target.searchParams.set("ticket", auth.ticket);
  if (auth.token) target.searchParams.set("token", auth.token);
  return target.toString();
};

const parseResponse = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  let data: unknown = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "message" in data
        ? String((data as { message?: unknown }).message || "")
        : text;
    throw new Error(message || `HTTP ${response.status}`);
  }

  return data as T;
};

const postJson = async <T>(url: string, data: unknown): Promise<T> => {
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  });

  return await parseResponse<T>(response);
};

const getSuggestionUsers = (query: string, page = 1, limit = 10) =>
  apiRequest<SuggestionUserPage | SuggestionUser[]>({
    method: "GET",
    path: "/api/v1/users/users/suggestions/",
    query: {
      search: query,
      page,
      limit
    }
  });

const createShareURL = (data: unknown, endpointUrl?: string, auth?: LionRequestAuth) =>
  postJson<ShareApiResponse>(withRequestAuth(withLionUrl("/api/share/", endpointUrl), auth), data);
const getShareSession = (id: string, data: unknown, endpointUrl?: string, auth?: LionRequestAuth) =>
  postJson<ShareSessionResponse>(withRequestAuth(withLionUrl(`/api/share/${id}/`, endpointUrl), auth), data);
const removeShareUser = (data: unknown, endpointUrl?: string, auth?: LionRequestAuth) =>
  postJson<ShareApiResponse>(withRequestAuth(withLionUrl("/api/share/remove/", endpointUrl), auth), data);

export { createShareURL, getShareSession, getSuggestionUsers, removeShareUser };
