import { z } from "zod";

/** POSIX NAME_MAX. Koko web SFTP does not set a tighter cap. */
export const SFTP_ENTRY_NAME_MAX_LENGTH = 255;

export function sftpEntryNameSchema(tooLongMessage: string) {
  return z.string().trim().min(1).max(SFTP_ENTRY_NAME_MAX_LENGTH, tooLongMessage);
}

export function sftpEntryNameError(name: string, tooLongMessage: string) {
  if (!name.trim()) return "";
  const result = sftpEntryNameSchema(tooLongMessage).safeParse(name);
  return result.success ? "" : result.error.issues[0]?.message || tooLongMessage;
}
