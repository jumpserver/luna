export type AiPanelResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export interface AiPanelResizeHandle {
  edge: AiPanelResizeEdge;
  class: string;
}

/** Shared 8-direction resize handle hit areas, reused by every resizable AI surface (docked panel + terminal HUD). */
export const AI_PANEL_RESIZE_HANDLES: AiPanelResizeHandle[] = [
  { edge: "w", class: "inset-y-2 -left-1 w-2 cursor-ew-resize" },
  { edge: "e", class: "inset-y-2 -right-1 w-2 cursor-ew-resize" },
  { edge: "n", class: "inset-x-2 -top-1 h-2 cursor-ns-resize" },
  { edge: "s", class: "inset-x-2 -bottom-1 h-2 cursor-ns-resize" },
  { edge: "nw", class: "-left-1 -top-1 size-3 cursor-nwse-resize" },
  { edge: "ne", class: "-right-1 -top-1 size-3 cursor-nesw-resize" },
  { edge: "sw", class: "-bottom-1 -left-1 size-3 cursor-nesw-resize" },
  { edge: "se", class: "-bottom-1 -right-1 size-4 cursor-nwse-resize" }
];
