import type { SqlSnippetPayload } from "~/composables/useApiRequest";

import { ref } from "vue";
import { createSqlSnippet, deleteSqlSnippet, getSqlSnippets } from "~/composables/useApiRequest";

export interface ChenSqlSnippet {
  id: string;
  name: string;
  args: string;
  module: string;
}

interface ChenSqlSnippetRequests {
  list: () => Promise<unknown>;
  create: (payload: SqlSnippetPayload) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
}

const defaultRequests: ChenSqlSnippetRequests = {
  list: getSqlSnippets,
  create: createSqlSnippet,
  remove: deleteSqlSnippet
};

function rawSnippetList(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray((value as any)?.results)) return (value as any).results;
  return [];
}

function snippetModuleValue(module: unknown) {
  if (module && typeof module === "object" && "value" in module) {
    return String((module as { value?: unknown }).value || "");
  }
  return String(module || "");
}

export function normalizeChenSqlSnippets(value: unknown, dbType: string): ChenSqlSnippet[] {
  return rawSnippetList(value).flatMap((raw): ChenSqlSnippet[] => {
    const id = String(raw?.id || "");
    const module = snippetModuleValue(raw?.module);
    if (!id || module !== dbType) return [];

    return [
      {
        id,
        name: String(raw?.name || id),
        args: String(raw?.args || ""),
        module
      }
    ];
  });
}

export function useChenSqlSnippets(getDbType: () => string, requests: ChenSqlSnippetRequests = defaultRequests) {
  const snippets = ref<ChenSqlSnippet[]>([]);
  const loading = ref(false);
  const saving = ref(false);
  const deletingId = ref("");

  async function load() {
    loading.value = true;
    try {
      snippets.value = normalizeChenSqlSnippets(await requests.list(), getDbType());
    } finally {
      loading.value = false;
    }
  }

  async function save(name: string, args: string) {
    saving.value = true;
    try {
      return await requests.create({ name, args, module: getDbType() });
    } finally {
      saving.value = false;
    }
  }

  async function remove(id: string) {
    deletingId.value = id;
    try {
      await requests.remove(id);
      await load();
    } finally {
      deletingId.value = "";
    }
  }

  return {
    deletingId,
    loading,
    saving,
    snippets,
    load,
    remove,
    save
  };
}
