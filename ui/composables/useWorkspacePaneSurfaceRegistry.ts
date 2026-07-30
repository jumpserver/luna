interface WorkspacePaneSurfaceHandle {
  focus?: () => void
}

const paneTargets = shallowReactive(new Map<string, HTMLElement>());
const paneSurfaces = new Map<string, WorkspacePaneSurfaceHandle>();

export function useWorkspacePaneSurfaceRegistry() {
  const getPaneTarget = (paneId: string) => paneTargets.get(paneId) || null;

  const registerPaneTarget = (paneId: string, target: HTMLElement) => {
    paneTargets.set(paneId, target);
  };

  const unregisterPaneTarget = (paneId: string, target: HTMLElement) => {
    if (paneTargets.get(paneId) === target) paneTargets.delete(paneId);
  };

  const registerPaneSurface = (paneId: string, surface: WorkspacePaneSurfaceHandle) => {
    paneSurfaces.set(paneId, surface);
  };

  const unregisterPaneSurface = (paneId: string, surface: WorkspacePaneSurfaceHandle) => {
    if (paneSurfaces.get(paneId) === surface) paneSurfaces.delete(paneId);
  };

  const focusPaneSurface = (paneId: string) => {
    paneSurfaces.get(paneId)?.focus?.();
  };

  return {
    focusPaneSurface,
    getPaneTarget,
    registerPaneSurface,
    registerPaneTarget,
    unregisterPaneSurface,
    unregisterPaneTarget
  };
}
