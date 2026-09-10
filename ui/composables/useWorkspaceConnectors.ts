import { desktopInvoke } from "~/shared/desktop/bridge";
import { isDesktopRuntime } from "~/utils/runtime";

export interface KokoTicketRequest {
  baseUrl: string;
  tokenId: string;
}

export interface KokoTicketResult {
  ticket?: string;
}

type KokoTicketProvider = (request: KokoTicketRequest) => Promise<KokoTicketResult>;

let kokoTicketProvider: KokoTicketProvider | null = null;

export const useWorkspaceConnectors = () => {
  const registerKokoTicketProvider = (provider: KokoTicketProvider | null) => {
    kokoTicketProvider = provider;
  };

  const createKokoTicket = (request: KokoTicketRequest) => {
    // Standalone connector pages do not mount the workspace ticket provider.
    if (!kokoTicketProvider && isDesktopRuntime()) {
      return desktopInvoke<KokoTicketResult>("create_koko_connect_ticket", {
        baseUrl: request.baseUrl,
        tokenId: request.tokenId
      });
    }
    if (!kokoTicketProvider) return Promise.resolve<KokoTicketResult>({});
    return kokoTicketProvider(request);
  };

  return {
    createKokoTicket,
    registerKokoTicketProvider
  };
};
