import type { ChenActionItem, ChenTreeNode } from "~/chen/types";

import { buildHeaders, chenPath, readJson } from "./client";

export async function fetchChenTreeChildren(
  chenToken: string,
  parent?: ChenTreeNode | null,
  force = false,
  endpointUrl?: string
) {
  const url = new URL(chenPath("/api/resources/children", endpointUrl), window.location.origin);
  if (force) url.searchParams.set("force", "true");

  const hasParent = !!parent;
  const response = await fetch(url.toString(), {
    method: "POST",
    credentials: "include",
    headers: {
      ...buildHeaders(chenToken, getWebApiMutationHeaders()),
      "Content-Type": "application/json"
    },
    ...(hasParent ? { body: JSON.stringify(parent) } : {})
  });

  return readJson<ChenTreeNode[]>(response);
}

export async function fetchChenActions(chenToken: string, node: ChenTreeNode, endpointUrl?: string) {
  const response = await fetch(chenPath("/api/resources/actions", endpointUrl), {
    method: "POST",
    credentials: "include",
    headers: {
      ...buildHeaders(chenToken, getWebApiMutationHeaders()),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(node)
  });

  return readJson<ChenActionItem[]>(response);
}

export async function runChenAction(chenToken: string, node: ChenTreeNode, action: string, endpointUrl?: string) {
  const response = await fetch(chenPath("/api/resources/actions/do", endpointUrl), {
    method: "POST",
    credentials: "include",
    headers: {
      ...buildHeaders(chenToken, getWebApiMutationHeaders()),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ node, action })
  });

  return readJson<{ event: string; data: any }>(response);
}
