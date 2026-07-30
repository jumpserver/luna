import type { JmsComponent } from "@jumpserver/connectors-core";

import type { Component } from "vue";
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";
import {
  KokoFileEditorSessionSurface,
  KokoFileManagerSessionSurface,
  KokoKubernetesWorkspace,
  KokoTerminalSessionSurface
} from "@jumpserver/koko";

import ChenDatabaseSessionSurface from "~/chen/workspaces/DatabaseSessionSurface.vue";
import LionRemoteSessionSurface from "~/lion/workspaces/RemoteSessionSurface.vue";
import { findDeclaredCapability } from "~/shared/connectors/capabilities";
import GuideSessionSurface from "~/shared/connectors/GuideSessionSurface.vue";
import LegacyIframeSession from "~/shared/connectors/LegacyIframeSession.vue";
import LocalShellSessionSurface from "~/workspaces/LocalShellSessionSurface.vue";

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

  const connectMethod = (tab.payload?.connectMethod as { value?: string } | undefined)?.value;
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
