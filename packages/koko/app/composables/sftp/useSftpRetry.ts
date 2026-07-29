import type { ConnectorSessionContext } from "@jumpserver/connectors-core";
import type { KokoHostAdapter } from "@jumpserver/koko/host";

import type { Ref } from "vue";

import type { SftpSocketClient } from "./useSftpSocket";
import { useKokoHostAdapter } from "@jumpserver/koko/host";

type SftpRetryHost = Pick<KokoHostAdapter, "createTicket" | "isTauriRuntime" | "sftp">;

interface SftpRetryOptions {
  beforeReconnect?: () => void;
  hostAdapter?: SftpRetryHost;
}

export function useSftpRetry(
  activeContext: Ref<ConnectorSessionContext | null>,
  socket: SftpSocketClient,
  { beforeReconnect, hostAdapter = useKokoHostAdapter() }: SftpRetryOptions = {}
) {
  async function reconnect() {
    const context = activeContext.value;
    if (!context?.tokenId) throw new Error("missing connection token");

    const token = await hostAdapter.sftp.exchangeConnectToken(context.tokenId);
    let ticket = context.ticket || "";
    try {
      ticket = String(
        (
          await hostAdapter.createTicket({
            baseUrl: context.endpointUrl,
            tokenId: token.id
          })
        ).ticket || ""
      );
    } catch (cause) {
      if (hostAdapter.isTauriRuntime()) throw cause;
      console.warn("[sftp] refresh connect ticket failed, fallback to cookie auth:", cause);
      ticket = "";
    }

    activeContext.value = { ...context, tokenId: token.id, ticket };
    beforeReconnect?.();
    socket.connect(activeContext.value);
  }

  return { reconnect };
}
