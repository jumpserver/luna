import type { InjectionKey, MaybeRef } from "vue";

import type { ConnectorSessionContext } from "~/shared/connectors/types/session";
import { resolveWsUrl } from "~/shared/connectors/useConnectorEndpoint";

export const connectorSessionKey: InjectionKey<MaybeRef<ConnectorSessionContext | null>> = Symbol("koko-connector-session");

export function useKokoWsUrl(wsRoute = "terminal") {
  const ctxRef = inject(connectorSessionKey);
  if (!ctxRef) {
    throw new Error("connectorSessionKey not provided");
  }
  const ctx = unref(ctxRef);
  if (!ctx) {
    throw new Error("connector session context is not ready");
  }
  return resolveWsUrl(ctx.component, wsRoute, ctx);
}
