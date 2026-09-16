export interface LionUploadFileInfo {
  id: string;
  name: string;
  batchId?: string;
  percentage?: number | null;
  type?: string;
  status?: "pending" | "uploading" | "finished" | "error";
  destinationLabel?: string;
  destinationPath?: string;
  createdAt?: number;
  error?: string;
  file?: File | null;
}

export interface LionUploadCustomRequestOptions {
  file: LionUploadFileInfo;
  onProgress?: (event: { percent?: number }) => void;
  onFinish?: () => void;
  onError?: () => void;
}
