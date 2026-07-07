import type { ChenActionItem, ChenAuthResponse, ChenProfile, ChenTreeNode } from "~/chen/types";

const buildHeaders = (token?: string, init?: HeadersInit) => ({
  ...getWebApiHeaders(),
  ...(token ? { token } : {}),
  ...(init || {})
});

function chenPath(path: string) {
  return withWebSitePrefix(`/chen${path.startsWith("/") ? path : `/${path}`}`);
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!response.ok) {
    throw new Error(text || `${response.status}`);
  }

  if (!text.trim()) {
    return {} as T;
  }

  return JSON.parse(text) as T;
}

export async function authChen(token: string, disableAutoHash = false) {
  const response = await fetch(chenPath("/api/auth"), {
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

export async function fetchChenProfile(chenToken: string) {
  const response = await fetch(chenPath("/api/profile"), {
    credentials: "include",
    headers: buildHeaders(chenToken)
  });

  return readJson<ChenProfile>(response);
}

export async function fetchChenTreeChildren(chenToken: string, parent?: ChenTreeNode | null, force = false) {
  const url = new URL(chenPath("/api/resources/children"), window.location.origin);
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

export async function fetchChenActions(chenToken: string, node: ChenTreeNode) {
  const response = await fetch(chenPath("/api/resources/actions"), {
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

export async function runChenAction(chenToken: string, node: ChenTreeNode, action: string) {
  const response = await fetch(chenPath("/api/resources/actions/do"), {
    method: "POST",
    credentials: "include",
    headers: {
      ...buildHeaders(chenToken, getWebApiMutationHeaders()),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ node, action })
  });

  return readJson<{ event: string, data: any }>(response);
}
