import type { Component } from "vue";
import type { AiTimelineDomain } from "../types";
import type { AiPanelDomainAdapter } from "./types";
import type { AiViewItemBuilder, AiViewItemBuilderFactory } from "./viewItems";
import type { WorkspaceAiSession } from "~/composables/useWorkspaceAiSessions";
import { defineAsyncComponent } from "vue";
import { getKokoFileAiSession } from "#koko/composables/sftp/useFileAiSessions";
import { getKokoTerminalAiSession } from "#koko/composables/terminal/useTerminalAiSessions";
import { getChenSqlAiSession } from "~/chen/composables/useChenSqlAiSessions";
import { sqlAiPanelDomain } from "./sql/adapter";
import { createSqlViewItemBuilder } from "./sql/viewItems";
import { fileAiPanelDomain } from "./file/adapter";
import { createFileViewItemBuilder } from "./file/viewItems";
import { terminalAiPanelDomain } from "./terminal/adapter";
import { createTerminalViewItemBuilder } from "./terminal/viewItems";

export interface AiPanelDomainRegistration {
  adapter: AiPanelDomainAdapter;
  getSession: (paneId: string) => WorkspaceAiSession | null;
  timelineRenderer: () => Promise<{ default: Component }>;
  createViewItemBuilder: AiViewItemBuilderFactory;
}

// New workspace AI domains have one registration point: add their session
// resolver, adapter, protocol builder, and timeline renderer here. Shared
// conversation items remain domain-neutral.
export const aiPanelDomainRegistry: readonly AiPanelDomainRegistration[] = [
  {
    adapter: sqlAiPanelDomain,
    getSession: getChenSqlAiSession,
    timelineRenderer: () => import("./sql/SqlAiTimelineItem.vue"),
    createViewItemBuilder: createSqlViewItemBuilder
  },
  {
    adapter: fileAiPanelDomain,
    getSession: getKokoFileAiSession,
    timelineRenderer: () => import("./file/FileAiTimelineItem.vue"),
    createViewItemBuilder: createFileViewItemBuilder
  },
  {
    adapter: terminalAiPanelDomain,
    getSession: getKokoTerminalAiSession,
    timelineRenderer: () => import("./terminal/TerminalAiTimelineItem.vue"),
    createViewItemBuilder: createTerminalViewItemBuilder
  }
];

const timelineRenderers = new Map<AiTimelineDomain, Component>([
  ["shared", defineAsyncComponent(() => import("./shared/AiMessageItem.vue"))],
  ...aiPanelDomainRegistry.map(
    ({ adapter, timelineRenderer }) => [adapter.id, defineAsyncComponent(timelineRenderer)] as const
  )
]);

export function resolveAiPanelDomain(session: WorkspaceAiSession): AiPanelDomainAdapter {
  const registration = aiPanelDomainRegistry.find(({ adapter }) => adapter.matches(session));
  if (!registration) throw new Error("No AI panel domain is registered for the active workspace session");
  return registration.adapter;
}

export function resolveAiPanelSession(paneId: string): WorkspaceAiSession | null {
  for (const registration of aiPanelDomainRegistry) {
    const session = registration.getSession(paneId);
    if (session) return session;
  }
  return null;
}

export function resolveAiTimelineRenderer(domain: AiTimelineDomain): Component {
  const renderer = timelineRenderers.get(domain);
  if (!renderer) throw new Error(`No AI timeline renderer is registered for domain: ${domain}`);
  return renderer;
}

export function createAiViewItemBuilders(): AiViewItemBuilder[] {
  return aiPanelDomainRegistry.map(({ createViewItemBuilder }) => createViewItemBuilder());
}
