import type { ChenGoApi, GoDownloadTicket, GoExport } from "./api";
import { desktopDialog, desktopInvoke } from "~/shared/desktop/bridge";
import { isDesktopRuntime } from "~/utils/runtime";

type DownloadResult = "started" | "saved" | "cancelled";
const inFlight = new WeakMap<ChenGoApi, Map<string, Promise<DownloadResult>>>();

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
  let frame = document.querySelector<HTMLIFrameElement>("iframe[data-chen-export-download]");
  if (!frame) {
    frame = document.createElement("iframe");
    frame.name = "chen-export-download";
    frame.hidden = true;
    frame.dataset.chenExportDownload = "";
    document.body.appendChild(frame);
  }
  const frameDocument = frame.contentDocument;
  if (!frameDocument) throw new Error("Browser download frame is unavailable; reload the page and retry");
  // A form POST from a no-referrer document sends Origin: null. Keep the
  // application's strict policy and isolate an origin-only policy in this
  // download-only document so the connector's origin check remains effective.
  let policy = frameDocument.querySelector<HTMLMetaElement>('meta[name="referrer"]');
  if (!policy) {
    policy = frameDocument.createElement("meta");
    policy.name = "referrer";
    frameDocument.head.appendChild(policy);
  }
  policy.content = "strict-origin";
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
  try {
    form.submit();
  } finally {
    form.remove();
  }
  // Browser downloads do not report completion to the page. Do not present this as a saved file.
  return "started";
}
