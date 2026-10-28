import type { WorkspacePane } from "~/composables/useWorkspaceTabs";
import type { ClipboardPermission } from "#koko/types/clipboard";
import { resolveClipboardAccess } from "#koko/utils/clipboardAcl";
import { useWorkspacePaneSurfaceRegistry } from "~/composables/useWorkspacePaneSurfaceRegistry";

export type WorkspaceClipboardPasteResult = "pasted" | "clipboard-sent" | "unavailable" | "denied";

export interface WorkspaceClipboardSurfaceTarget {
  terminal: boolean;
  mode: "paste" | "remote-clipboard";
  paste: (text: string) => WorkspaceClipboardPasteResult | Promise<WorkspaceClipboardPasteResult>;
  focus: () => void;
}

export interface WorkspaceClipboardPasteTarget extends Omit<WorkspaceClipboardSurfaceTarget, "paste"> {
  paste: (text: string) => Promise<WorkspaceClipboardPasteResult>;
}

interface ClipboardSurface {
  element: HTMLElement;
  capture: () => WorkspaceClipboardSurfaceTarget | null;
}

const surfaces = new Set<ClipboardSurface>();

/** Each connector captures its own input instance and applies its own clipboard ACL. */
export function registerWorkspaceClipboardSurface(element: HTMLElement, capture: ClipboardSurface["capture"]) {
  const surface = { element, capture };
  surfaces.add(surface);
  return () => surfaces.delete(surface);
}

export function captureWorkspaceClipboardTarget(
  pane: WorkspacePane,
  paneElement: HTMLElement,
  isCurrent: () => boolean
): WorkspaceClipboardPasteTarget | null {
  const focused = paneElement.ownerDocument.activeElement;
  const surface = [...surfaces].find(({ element }) => paneElement.contains(element) && element.contains(focused));
  if (!surface || pane.status !== "connected" || !isCurrent()) return null;
  const target = surface.capture();
  if (!target) return null;
  const available = () =>
    isCurrent() &&
    pane.status === "connected" &&
    surfaces.has(surface) &&
    surface.element.isConnected &&
    paneElement.contains(surface.element) &&
    surface.element.getClientRects().length > 0;
  const permissionAllows = () => {
    const actions = pane.payload?.token?.actions ?? pane.payload?.actions;
    return resolveClipboardAccess({ actions: actions as ClipboardPermission["actions"] }).paste.enabled;
  };

  return {
    terminal: target.terminal,
    mode: target.mode,
    async paste(text) {
      if (!available()) return "unavailable";
      if (!permissionAllows()) return "denied";
      // The connector rechecks input state and permission immediately before the write.
      return target.paste(text);
    },
    focus() {
      if (available()) target.focus();
    }
  };
}

export function useWorkspaceClipboardPaste() {
  const { activeTab, activePaneId } = useWorkspaceTabs();
  const { getPaneTarget } = useWorkspacePaneSurfaceRegistry();

  function captureTarget(): WorkspaceClipboardPasteTarget | null {
    const tab = activeTab.value;
    const pane = tab?.panes.find((item) => item.id === activePaneId.value);
    const element = pane && getPaneTarget(pane.id);
    if (!tab || !pane || !element) return null;
    return captureWorkspaceClipboardTarget(
      pane,
      element,
      () =>
        activeTab.value === tab &&
        activePaneId.value === pane.id &&
        tab.panes.includes(pane) &&
        getPaneTarget(pane.id) === element
    );
  }

  return { captureTarget };
}
