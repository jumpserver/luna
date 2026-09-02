import type { JmsComponent } from "@jumpserver/connectors-core";

import type { Component } from "vue";
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";
import type { KokoSurfaceMode } from "~/shared/connectors/types/component";
import { findDeclaredCapability } from "~/shared/connectors/capabilities";

const KokoTerminalSessionSurface = defineAsyncComponent(() =>
  import("#koko").then((module) => module.KokoTerminalSessionSurface)
);
const KokoFileManagerSessionSurface = defineAsyncComponent(() =>
  import("#koko").then((module) => module.KokoFileManagerSessionSurface)
);
const KokoFileEditorSessionSurface = defineAsyncComponent(() =>
  import("#koko").then((module) => module.KokoFileEditorSessionSurface)
);
const KokoKubernetesWorkspace = defineAsyncComponent(() =>
  import("#koko").then((module) => module.KokoKubernetesWorkspace)
);
const ChenDatabaseSessionSurface = defineAsyncComponent(() => import("~/chen/workspaces/DatabaseSessionSurface.vue"));
const LionRemoteSessionSurface = defineAsyncComponent(() => import("~/lion/workspaces/RemoteSessionSurface.vue"));
const GuideSessionSurface = defineAsyncComponent(() => import("~/shared/connectors/GuideSessionSurface.vue"));
const LegacyIframeSession = defineAsyncComponent(() => import("~/shared/connectors/LegacyIframeSession.vue"));
const LocalShellSessionSurface = defineAsyncComponent(() => import("~/workspaces/LocalShellSessionSurface.vue"));
const ScriptEditorSessionSurface = defineAsyncComponent(() => import("~/workspaces/ScriptEditorSessionSurface.vue"));
const WebProxySessionSurface = defineAsyncComponent(() => import("~/workspaces/WebProxySessionSurface.vue"));

export interface ConnectorRegistryEntry {
  component: Component;
  mode: KokoSurfaceMode | "legacy-iframe";
  native?: boolean;
}

export const CONNECTOR_REGISTRY: Record<Extract<JmsComponent, "koko">, ConnectorRegistryEntry> = {
  koko: {
    component: KokoTerminalSessionSurface,
    mode: "native",
    native: true
  }
};

export function resolveSessionComponent(tab: WorkspaceSessionTab): JmsComponent {
  const method = tab.payload?.connectMethod as { component?: string } | undefined;
  let component = method?.component || (tab.protocol === "ssh" ? "koko" : "default");

  if (component === "tinker") component = "lion";
  if (component === "default" && tab.protocol === "ssh") component = "koko";
  if (component === "koko") return "koko";

  // Koko's legacy webUrl is kept in the tab for a fallback, but native SSH
  // surfaces must be selected before generic external-Web handling.
  if (tab.payload?.webUrl) return "default";

  return component as JmsComponent;
}

export function resolveSessionSurface(tab: WorkspaceSessionTab): Component {
  if (tab.protocol === "local-shell") {
    return LocalShellSessionSurface;
  }

  if (tab.protocol === "script-editor") {
    return ScriptEditorSessionSurface;
  }

  const connectMethod = (tab.payload?.connectMethod as { value?: string } | undefined)?.value || tab.connectMethod;
  if (connectMethod?.endsWith("_guide")) {
    return GuideSessionSurface;
  }
  const capability = findDeclaredCapability(tab.protocol, connectMethod);

  if (capability?.surface === "file-manager") {
    return KokoFileManagerSessionSurface;
  }

  if (capability?.surface === "database") {
    return ChenDatabaseSessionSurface;
  }

  if (capability?.surface === "file-editor") {
    return KokoFileEditorSessionSurface;
  }

  if (tab.protocol === "sftp") {
    return KokoFileManagerSessionSurface;
  }

  if (capability?.surface === "k8s-ui" || ["k8s", "kubernetes"].includes(tab.protocol)) {
    return KokoKubernetesWorkspace;
  }

  if (capability?.surface === "remote-desktop") {
    return LionRemoteSessionSurface;
  }

  if (capability?.surface === "web-browser") {
    return WebProxySessionSurface;
  }

  const component = resolveSessionComponent(tab);

  switch (component) {
    case "koko":
      return CONNECTOR_REGISTRY.koko.component;
    case "lion":
    case "tinker":
      return LionRemoteSessionSurface;
    default:
      return LegacyIframeSession;
  }
}
