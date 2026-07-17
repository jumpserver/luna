import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

import { isTauriRuntime } from "~/utils/runtime";

interface ChenDownloadAnchor {
  href: string
  download: string
  click: () => void
}

export interface ChenDownloadRuntime {
  isTauri: () => boolean
  createAnchor?: () => ChenDownloadAnchor
  appendAnchor?: (anchor: ChenDownloadAnchor) => void
  removeAnchor?: (anchor: ChenDownloadAnchor) => void
  createObjectURL?: (blob: Blob) => string
  revokeObjectURL?: (url: string) => void
  savePath: (fileName: string) => Promise<string | null>
  writeFile: (path: string, bytes: Uint8Array) => Promise<void>
}

const defaultRuntime: ChenDownloadRuntime = {
  isTauri: isTauriRuntime,
  createAnchor: () => document.createElement("a"),
  appendAnchor: (anchor) => document.body.appendChild(anchor as HTMLAnchorElement),
  removeAnchor: (anchor) => (anchor as HTMLAnchorElement).remove(),
  createObjectURL: (blob) => URL.createObjectURL(blob),
  revokeObjectURL: (url) => URL.revokeObjectURL(url),
  savePath: (fileName) => save({ defaultPath: fileName }),
  writeFile: async (path, bytes) => {
    await invoke("plugin:fs|write_file", bytes, {
      headers: { path: encodeURIComponent(path) }
    });
  }
};

export async function saveChenExport(
  blob: Blob,
  fileName: string,
  runtime: ChenDownloadRuntime = defaultRuntime
): Promise<"saved" | "cancelled"> {
  if (runtime.isTauri()) {
    const path = await runtime.savePath(fileName);
    if (!path) return "cancelled";

    await runtime.writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    return "saved";
  }

  if (
    !runtime.createAnchor
    || !runtime.appendAnchor
    || !runtime.removeAnchor
    || !runtime.createObjectURL
    || !runtime.revokeObjectURL
  ) {
    throw new Error("Web download runtime is unavailable");
  }

  const anchor = runtime.createAnchor();
  const url = runtime.createObjectURL(blob);
  try {
    anchor.href = url;
    anchor.download = fileName;
    runtime.appendAnchor(anchor);
    anchor.click();
  } finally {
    runtime.removeAnchor(anchor);
    runtime.revokeObjectURL(url);
  }
  return "saved";
}
