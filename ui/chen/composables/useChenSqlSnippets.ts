import type { SqlSnippetListParams, SqlSnippetPayload } from "~/composables/useApiRequest";

import { ref } from "vue";
import { createSqlSnippet, deleteSqlSnippet, getSqlSnippets } from "~/composables/useApiRequest";

export interface ChenSqlSnippet {
  id: string;
  name: string;
  args: string;
  module: string;
}

interface ChenSqlSnippetRequests {
  list: (query: SqlSnippetListParams) => Promise<unknown>;
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

function snippetCount(value: unknown, fallback: number) {
  const count = Number((value as any)?.count);
  return Number.isInteger(count) && count >= 0 ? count : fallback;
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
  const pageSize = 10;
  const snippets = ref<ChenSqlSnippet[]>([]);
  const page = ref(1);
  const total = ref(0);
  const loading = ref(false);
  const saving = ref(false);
  const deletingId = ref("");

  async function load(nextPage = page.value) {
    page.value = Math.max(1, Math.trunc(nextPage));
    loading.value = true;
    try {
      const dbType = getDbType();
      const data = await requests.list({
        module: dbType,
        limit: pageSize,
        offset: (page.value - 1) * pageSize,
        order: "-date_updated"
      });
      snippets.value = normalizeChenSqlSnippets(data, dbType);
      total.value = snippetCount(data, snippets.value.length);
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
      if (snippets.value.length === 1 && page.value > 1) page.value -= 1;
      await load();
    } finally {
      deletingId.value = "";
    }
  }

  return {
    deletingId,
    loading,
    page,
    pageSize,
    saving,
    snippets,
    total,
    load,
    remove,
    save
  };
}
