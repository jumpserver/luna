import { withBasePath, withLionPath } from "@/lion/utils/base";

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

const createShareURL = (data: any) => postJson(withLionPath("/api/share/"), data);
const getShareSession = (id: string, data: any) => postJson(withLionPath(`/api/share/${id}/`), data);
const removeShareUser = (data: any) => postJson(withLionPath("/api/share/remove/"), data);

export { createShareURL, getShareSession, getSuggestionUsers, removeShareUser };
