import { desktopDialog, desktopFs } from "~/shared/desktop/bridge";
import { isDesktopRuntime } from "~/utils/runtime";

interface ChenDownloadAnchor {
  href: string;
  download: string;
  click: () => void;
}

export interface ChenDownloadRuntime {
  isDesktop: () => boolean;
  createAnchor?: () => ChenDownloadAnchor;
  appendAnchor?: (anchor: ChenDownloadAnchor) => void;
  removeAnchor?: (anchor: ChenDownloadAnchor) => void;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  savePath: (fileName: string) => Promise<string | null>;
  writeFile: (path: string, bytes: Uint8Array) => Promise<void>;
}

const defaultRuntime: ChenDownloadRuntime = {
  isDesktop: isDesktopRuntime,
  createAnchor: () => document.createElement("a"),
  appendAnchor: (anchor) => document.body.appendChild(anchor as HTMLAnchorElement),
  removeAnchor: (anchor) => (anchor as HTMLAnchorElement).remove(),
  createObjectURL: (blob) => URL.createObjectURL(blob),
  revokeObjectURL: (url) => URL.revokeObjectURL(url),
  savePath: (fileName) => desktopDialog.save({ defaultPath: fileName }),
  writeFile: desktopFs.writeFile
};

export async function saveChenExport(
  blob: Blob,
  fileName: string,
  runtime: ChenDownloadRuntime = defaultRuntime
): Promise<"saved" | "cancelled"> {
  if (runtime.isDesktop()) {
    const path = await runtime.savePath(fileName);
    if (!path) return "cancelled";

    await runtime.writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    return "saved";
  }

  if (
    !runtime.createAnchor ||
    !runtime.appendAnchor ||
    !runtime.removeAnchor ||
    !runtime.createObjectURL ||
    !runtime.revokeObjectURL
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
