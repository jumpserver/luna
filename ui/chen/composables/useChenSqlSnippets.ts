import type { SqlSnippetListParams, SqlSnippetPayload } from "~/composables/useApiRequest";

import { getCurrentScope, onScopeDispose, ref, watch } from "vue";
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

  let generation = 0;
  let loadSerial = 0;

  function reset() {
    generation += 1;
    loadSerial += 1;
    snippets.value = [];
    page.value = 1;
    total.value = 0;
    loading.value = false;
    saving.value = false;
    deletingId.value = "";
  }
  watch(getDbType, reset, { flush: "sync" });
  if (getCurrentScope()) onScopeDispose(reset);

  async function load(nextPage = page.value): Promise<void> {
    const serial = ++loadSerial;
    const dbType = getDbType();
    const current = () => serial === loadSerial && dbType === getDbType();
    page.value = Math.max(1, Math.trunc(nextPage));
    loading.value = true;
    try {
      const data = await requests.list({
        module: dbType,
        limit: pageSize,
        offset: (page.value - 1) * pageSize,
        order: "-date_updated"
      });
      if (!current()) return;
      const count = snippetCount(data, rawSnippetList(data).length);
      const lastPage = Math.max(1, Math.ceil(count / pageSize));
      if (page.value > lastPage) return load(lastPage);
      snippets.value = normalizeChenSqlSnippets(data, dbType);
      total.value = snippetCount(data, snippets.value.length);
    } catch (cause) {
      if (current()) {
        snippets.value = [];
        total.value = 0;
        throw cause;
      }
    } finally {
      if (current()) loading.value = false;
    }
  }

  async function save(name: string, args: string) {
    if (saving.value) return;
    const started = generation;
    saving.value = true;
    try {
      return await requests.create({ name, args, module: getDbType() });
    } finally {
      if (started === generation) saving.value = false;
    }
  }

  async function remove(id: string) {
    if (deletingId.value || loading.value) return;
    const started = generation;
    deletingId.value = id;
    try {
      await requests.remove(id);
      if (started !== generation) return;
      if (snippets.value.length === 1 && page.value > 1) page.value -= 1;
      await load();
    } finally {
      if (started === generation) deletingId.value = "";
    }
  }

  return {
    reset,
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
