import { Image as TauriImage } from "@tauri-apps/api/image";
import {
  readText as readTauriText,
  writeImage as writeTauriImage,
  writeText as writeTauriText
} from "@tauri-apps/plugin-clipboard-manager";
import { readText as readWebText, writeText as writeWebText } from "clipboard-polyfill";

import { isTauriRuntime } from "~/utils/runtime";

export async function readClipboardText() {
  if (isTauriRuntime()) {
    return await readTauriText();
  }

  if (typeof navigator === "undefined" || typeof navigator.clipboard?.readText !== "function") {
    return "";
  }

  return await readWebText();
}

export async function writeClipboardText(text: string) {
  if (isTauriRuntime()) {
    await writeTauriText(text);
    return;
  }

  await writeWebText(text);
}

export async function writeClipboardBlob(blob: Blob) {
  if (isTauriRuntime()) {
    if (!blob.type.startsWith("image/")) {
      throw new Error(`Tauri clipboard does not support ${blob.type || "this data type"}`);
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
    const image = await TauriImage.new(new Uint8Array(rgba), canvas.width, canvas.height);
    try {
      await writeTauriImage(image);
    } finally {
      await image.close();
    }
    return;
  }

  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("Binary clipboard writes are unavailable");
  }
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
}
