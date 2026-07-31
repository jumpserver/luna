import type { Ref } from "vue";
import type { SftpFileEntry } from "./protocol";

export interface SftpEditorDraft {
  path: string;
  entry: SftpFileEntry;
  content: string;
  savedContent: string;
  encoding: string;
  savedEncoding: string;
  lineEnding: string;
  savedLineEnding: string;
  remoteVersion: string;
  remoteMetadataVersion: string;
  updatedAt: number;
}

interface StoredSftpEditorDraft extends SftpEditorDraft {
  id: string;
  scope: string;
}

const databaseName = "jumpserver-file-editor";
const storeName = "drafts";
const maxDraftAgeMs = 7 * 24 * 60 * 60 * 1000;

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) {
        const store = database.createObjectStore(storeName, { keyPath: "id" });
        store.createIndex("scope", "scope");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open editor draft storage"));
  });
}

async function scopeFor(token: string) {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function useSftpEditorDrafts(token: Ref<string>) {
  async function withStore<T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore, scope: string) => IDBRequest<T>
  ) {
    if (!import.meta.client || !token.value || !globalThis.indexedDB) return null;
    const scope = await scopeFor(token.value);
    if (!scope) return null;
    const database = await openDatabase();
    try {
      return await requestResult(operation(database.transaction(storeName, mode).objectStore(storeName), scope));
    } finally {
      database.close();
    }
  }

  async function save(draft: SftpEditorDraft) {
    await withStore("readwrite", (store, scope) =>
      store.put({
        ...draft,
        entry: { ...draft.entry },
        id: `${scope}\u0000${draft.path}`,
        scope
      } satisfies StoredSftpEditorDraft)
    );
  }

  async function remove(path: string) {
    await withStore("readwrite", (store, scope) => store.delete(`${scope}\u0000${path}`));
  }

  async function list() {
    const drafts = (await withStore("readonly", (store, scope) => store.index("scope").getAll(scope))) as
      | StoredSftpEditorDraft[]
      | null;
    if (!drafts) return [];
    const oldest = Date.now() - maxDraftAgeMs;
    const expired = drafts.filter((draft) => draft.updatedAt < oldest);
    await Promise.all(expired.map((draft) => remove(draft.path)));
    return drafts
      .filter((draft) => draft.updatedAt >= oldest)
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map(({ id: _id, scope: _scope, ...draft }) => draft);
  }

  return { list, remove, save };
}
