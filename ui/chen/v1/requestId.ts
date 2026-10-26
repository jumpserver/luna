export function newChenRequestId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // getRandomValues is available on existing HTTP intranet deployments too.
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
