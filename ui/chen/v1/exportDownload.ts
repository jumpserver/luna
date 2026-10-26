import type { GoDownloadTicket } from "./api";
import { desktopDialog, desktopInvoke } from "~/shared/desktop/bridge";
import { isDesktopRuntime } from "~/utils/runtime";

export async function downloadGoExport(
  getTicket: () => Promise<GoDownloadTicket>,
  fileName: string
): Promise<"started" | "saved" | "cancelled"> {
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
  const form = document.createElement("form");
  form.method = "POST";
  form.action = ticket.download_url;
  form.target = frame.name;
  form.hidden = true;
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "ticket";
  input.value = ticket.fields.ticket;
  form.appendChild(input);
  document.body.appendChild(form);
  try {
    form.submit();
  } finally {
    form.remove();
  }
  // Browser downloads do not report completion to the page. Do not present this as a saved file.
  return "started";
}
