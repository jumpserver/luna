import type { ChenAuthResponse, ChenProfile } from "~/chen/types";

import { buildHeaders, chenPath, readJson } from "./client";

export async function authChen(token: string, disableAutoHash = false, endpointUrl?: string) {
  const response = await fetch(chenPath("/api/auth", endpointUrl), {
    method: "POST",
    credentials: "include",
    headers: {
      ...buildHeaders(undefined, getWebApiMutationHeaders()),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      token,
      disableAutoHash
    })
  });

  return readJson<ChenAuthResponse>(response);
}

export async function fetchChenProfile(chenToken: string, endpointUrl?: string) {
  const response = await fetch(chenPath("/api/profile", endpointUrl), {
    credentials: "include",
    headers: buildHeaders(chenToken)
  });

  return readJson<ChenProfile>(response);
}
