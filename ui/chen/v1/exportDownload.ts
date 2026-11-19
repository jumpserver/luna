import type { ChenGoApi, GoDownloadTicket, GoExport } from "./api";
import { desktopDialog, desktopInvoke } from "~/shared/desktop/bridge";
import { isDesktopRuntime } from "~/utils/runtime";

type DownloadResult = "started" | "saved" | "cancelled";
const inFlight = new WeakMap<ChenGoApi, Map<string, Promise<DownloadResult>>>();
const exportFileLifetimeMs = 15 * 60 * 1000;

export async function downloadGoExportFile(api: ChenGoApi, job: GoExport, assertReady: () => void) {
  assertReady();
  const jobs = inFlight.get(api) || new Map<string, Promise<DownloadResult>>();
  const existing = jobs.get(job.id);
  if (existing) return existing;
  const fileName = job.filename || `chen-${job.id.replace(/[^\w-]/g, "_")}.${job.format}`;
  const result = downloadGoExport(async () => {
    assertReady();
    const ticket = await api.exportDownloadTicket(job.id);
    assertReady();
    return ticket;
  }, fileName).finally(() => jobs.delete(job.id));
  inFlight.set(api, jobs);
  jobs.set(job.id, result);
  return result;
}

async function downloadGoExport(getTicket: () => Promise<GoDownloadTicket>, fileName: string): Promise<DownloadResult> {
  if (isDesktopRuntime()) {
    // Choosing a path may take longer than the ticket's short lifetime. Mint it only after confirmation.
    const filePath = await desktopDialog.save({ defaultPath: fileName });
    if (!filePath) return "cancelled";
    const ticket = await getTicket();
    return desktopInvoke("download_chen_export", { url: ticket.download_url, ticket: ticket.fields.ticket, filePath });
  }
  const ticket = await getTicket();
  // The native download streams straight to disk. No file-sized Blob, arrayBuffer or renderer buffer.
  // Each POST needs its own frame. A second navigation can cancel a pending response.
  const frame = document.createElement("iframe");
  frame.hidden = true;
  frame.dataset.chenExportDownload = "";
  document.body.appendChild(frame);
  try {
    const frameDocument = frame.contentDocument;
    if (!frameDocument) throw new Error("Browser download frame is unavailable; reload the page and retry");
    // The download document needs an origin-only referrer policy for the connector's origin check.
    const policy = frameDocument.createElement("meta");
    policy.name = "referrer";
    policy.content = "strict-origin";
    frameDocument.head.appendChild(policy);
    const form = frameDocument.createElement("form");
    form.method = "POST";
    form.action = ticket.download_url;
    form.target = "_self";
    form.hidden = true;
    const input = frameDocument.createElement("input");
    input.type = "hidden";
    input.name = "ticket";
    input.value = ticket.fields.ticket;
    form.appendChild(input);
    frameDocument.body.appendChild(form);
    form.submit();
    form.remove();
  } catch (error) {
    frame.remove();
    throw error;
  }
  // Native downloads have no completion event. Keep the frame for the server file's full lifetime.
  window.setTimeout(() => frame.remove(), exportFileLifetimeMs);
  return "started";
}
