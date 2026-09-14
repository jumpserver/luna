import { z } from "zod";

/** POSIX NAME_MAX. Koko web SFTP does not set a tighter cap. */
export const SFTP_ENTRY_NAME_MAX_LENGTH = 255;
const invalidEntryName = /[<>:"/\\|?*]/;

function hasControlChar(name: string) {
  for (let i = 0; i < name.length; i++) {
    if (name.charCodeAt(i) < 32) return true;
  }
  return false;
}

export function sftpEntryNameSchema(tooLongMessage: string) {
  return z.string().trim().min(1).max(SFTP_ENTRY_NAME_MAX_LENGTH, tooLongMessage);
}

export function sftpEntryNameError(name: string, tooLongMessage: string, invalidMessage = tooLongMessage) {
  const trimmed = name.trim();
  if (!trimmed) return "";
  if (trimmed === "." || trimmed === ".." || invalidEntryName.test(trimmed) || hasControlChar(trimmed))
    return invalidMessage;
  const result = sftpEntryNameSchema(tooLongMessage).safeParse(name);
  return result.success ? "" : result.error.issues[0]?.message || tooLongMessage;
}
