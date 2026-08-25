import type { ConnectorSessionContext } from "@jumpserver/connectors-core";
import type { MaybeRef } from "vue";
import type { SftpFileEntry, SftpFileOperations } from "../protocol";
import type { FileTransferEndpointRef } from "~/shared/file-transfer/types";

export type SftpWorkspaceSide = "left" | "right";

export interface SftpRemotePane {
  id: string;
  side: SftpWorkspaceSide;
  assetId?: string;
  context: ConnectorSessionContext;
  organizationName: string;
  assetName: string;
  transferEndpoint: FileTransferEndpointRef;
  selection: SftpFileEntry | null;
  /** Pinned tabs survive "close others" / "close right" and sort toward the front. */
  pinned?: boolean;
}

export interface FileWorkspaceSourceAsset {
  id: string;
  name: string;
}

export interface FileWorkspacePreconnect {
  assetId: string;
  assetName: string;
  tokenId?: string;
}

export interface RecentSftpConnection {
  assetId: string;
  assetName: string;
  organizationId?: string;
  organizationName?: string;
  lastConnectedAt: number;
}

export interface SftpTransferDropPayload {
  sourceEndpoint: FileTransferEndpointRef;
  sourcePath: string;
  sourceSelectionRevision: number;
  entries: Array<Pick<SftpFileEntry, "name" | "size">>;
  destinationPath: string;
}

export type SftpTransferSourcePayload = Omit<SftpTransferDropPayload, "destinationPath">;

export interface SftpRemotePaneHandle {
  manager: {
    connected: MaybeRef<boolean>;
    currentPath: MaybeRef<string>;
    loadCurrentDirectory: () => Promise<boolean>;
    operations: SftpFileOperations;
    retry: { reconnect: () => Promise<void> };
  };
  selectedEntries: SftpFileEntry[];
  clearSelection: () => void;
  clearTransferredSelection: (names: string[], sourcePath: string, revision: number) => void;
  transferSourcePayload: () => SftpTransferSourcePayload | null;
  focusPane: () => void;
  refresh: () => Promise<void>;
}

export interface SftpTransferPaneHandle {
  manager: {
    currentPath: MaybeRef<string>;
    operations: Pick<SftpFileOperations, "readFile" | "uploadBlob">;
  };
  clearTransferredSelection: (names: string[], sourcePath: string, revision: number) => void;
  transferSourcePayload: () => SftpTransferSourcePayload | null;
}

export interface SftpLocalPaneHandle extends SftpTransferPaneHandle {
  selectedEntries: SftpFileEntry[];
  clearSelection: () => void;
  clearTransferredSelection: (names: string[], sourcePath: string, revision: number) => void;
  focusPane: () => void;
  list: () => Promise<void>;
  refresh: () => Promise<void>;
  transferSourcePayload: () => SftpTransferSourcePayload | null;
}

export interface SftpTransferCenterHandle {
  signalQueued: (origin?: DOMRect) => void;
}

export interface SftpDistributionTargetOption {
  id: string;
  endpoint: FileTransferEndpointRef;
  organizationName: string;
  assetName: string;
  destinationPath: string;
  connected: boolean;
}
