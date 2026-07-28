import type { InjectionKey, MaybeRef } from "vue";

import type { ConnectorSessionContext } from "./types/session";
import { inject, unref } from "vue";
import { resolveWsUrl } from "./useConnectorEndpoint";

export const connectorSessionKey: InjectionKey<MaybeRef<ConnectorSessionContext | null>> = Symbol("connector-session");

export function useConnectorWsUrl(wsRoute = "terminal") {
  const ctxRef = inject(connectorSessionKey);
  if (!ctxRef) throw new Error("connectorSessionKey not provided");

  const ctx = unref(ctxRef);
  if (!ctx) throw new Error("connector session context is not ready");

  return resolveWsUrl(ctx.component, wsRoute, ctx);
}
