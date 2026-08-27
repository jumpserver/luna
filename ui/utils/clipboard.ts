import { readText as readWebText, writeText as writeWebText } from "clipboard-polyfill";

import { desktopClipboard } from "~/shared/desktop/bridge";
import { isDesktopRuntime } from "~/utils/runtime";

export async function readClipboardText() {
  if (isDesktopRuntime()) {
    return await desktopClipboard.readText();
  }

  if (typeof navigator === "undefined" || typeof navigator.clipboard?.readText !== "function") {
    return "";
  }

  return await readWebText();
}

export async function writeClipboardText(text: string) {
  if (isDesktopRuntime()) {
    await desktopClipboard.writeText(text);
    return;
  }

  await writeWebText(text);
}

export async function writeClipboardBlob(blob: Blob) {
  if (isDesktopRuntime()) {
    if (!blob.type.startsWith("image/")) {
      throw new Error(`Desktop clipboard does not support ${blob.type || "this data type"}`);
    }

    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      bitmap.close();
      throw new Error("Unable to create an image clipboard context");
    }

    context.drawImage(bitmap, 0, 0);
    const rgba = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    bitmap.close();
    await desktopClipboard.writeImage(new Uint8Array(rgba), canvas.width, canvas.height);
    return;
  }

  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("Binary clipboard writes are unavailable");
  }
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
}
