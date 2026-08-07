import { withBasePath, withLionUrl } from "@/lion/utils/base";

const postJson = (url: string, data: any) => {
  return fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  });
};

const getSuggestionUsers = (query: string) => {
  const url = new URL(withBasePath("/api/v1/users/users/suggestions/"), window.location.origin);
  url.searchParams.set("search", query);
  return fetch(url.toString(), { credentials: "include" });
};

const createShareURL = (data: any, endpointUrl?: string) => postJson(withLionUrl("/api/share/", endpointUrl), data);
const getShareSession = (id: string, data: any, endpointUrl?: string) =>
  postJson(withLionUrl(`/api/share/${id}/`, endpointUrl), data);
const removeShareUser = (data: any, endpointUrl?: string) =>
  postJson(withLionUrl("/api/share/remove/", endpointUrl), data);

export { createShareURL, getShareSession, getSuggestionUsers, removeShareUser };
