import type { Component } from "vue";

import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";
import type { JmsComponent, KokoSurfaceMode } from "~/shared/connectors/types/component";

import KokoIframeSession from "~/koko-iframe/workspace/IframeSession.vue";
import KokoSessionSurface from "~/koko/workspace/SessionSurface.vue";
import LegacyIframeSession from "~/shared/connectors/LegacyIframeSession.vue";

export interface ConnectorRegistryEntry {
  component: Component
  mode: KokoSurfaceMode | "legacy-iframe"
  native?: boolean
}

export const CONNECTOR_REGISTRY: Record<Extract<JmsComponent, "koko" | "koko-iframe">, ConnectorRegistryEntry> = {
  koko: {
    component: KokoSessionSurface,
    mode: "native",
    native: true
  },
  "koko-iframe": {
    component: KokoIframeSession,
    mode: "iframe",
    native: false
  }
};

const kokoSurfaceEnv = () => {
  const env = import.meta.env.VITE_KOKO_SURFACE as KokoSurfaceMode | undefined;
  if (env === "iframe" || env === "native") return env;
  if (import.meta.client) {
    const stored = localStorage.getItem("koko_surface") as KokoSurfaceMode | null;
    if (stored === "iframe" || stored === "native") return stored;
  }
  return "native";
};

export function resolveKokoComponent(): "koko" | "koko-iframe" {
  return kokoSurfaceEnv() === "iframe" ? "koko-iframe" : "koko";
}

export function resolveSessionComponent(tab: WorkspaceSessionTab): JmsComponent {
  if (tab.payload?.webUrl) return "default";

  const method = tab.payload?.connectMethod as { component?: string } | undefined;
  let component = method?.component || (tab.protocol === "ssh" ? "koko" : "default");

  if (component === "tinker") component = "lion";
  if (component === "default" && tab.protocol === "ssh") component = "koko";
  if (component === "koko") return resolveKokoComponent();

  return component as JmsComponent;
}

export function resolveSessionSurface(tab: WorkspaceSessionTab): Component {
  if (tab.payload?.webUrl) return LegacyIframeSession;

  const component = resolveSessionComponent(tab);

  switch (component) {
    case "koko":
      return CONNECTOR_REGISTRY.koko.component;
    case "koko-iframe":
      return CONNECTOR_REGISTRY["koko-iframe"].component;
    default:
      return LegacyIframeSession;
  }
}
