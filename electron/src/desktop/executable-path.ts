import path from "node:path";

export function resolveExecutablePath(raw: unknown) {
  const value = String(raw || "").trim();
  if (!value || !path.isAbsolute(value)) throw new Error("executable path must be absolute");
  return path.resolve(value);
}
