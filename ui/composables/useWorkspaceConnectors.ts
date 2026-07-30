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
    if (!kokoTicketProvider) return Promise.resolve<KokoTicketResult>({});
    return kokoTicketProvider(request);
  };

  return {
    createKokoTicket,
    registerKokoTicketProvider
  };
};
