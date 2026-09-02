import type { CommandSnippetPayload } from "~/composables/useApiRequest";
import type { SnippetVariableDefinition } from "~/utils/snippetVariables";
import { createCommandSnippet, getCommandSnippetVariableForm, updateCommandSnippet } from "~/composables/useApiRequest";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { normalizeSnippetVariableDefinitions, normalizeSnippetVariableFields } from "~/utils/snippetVariables";

export interface SnippetModule {
  value: string;
  label: string;
}

export interface Snippet {
  id: string;
  name: string;
  args: string;
  module: SnippetModule;
  variable: SnippetVariableDefinition[];
  comment: string;
  createdBy: string;
  scope: "private" | "public";
}

const rawList = (value: unknown): any[] =>
  Array.isArray(value) ? value : Array.isArray((value as any)?.results) ? (value as any).results : [];

const normalizeSnippet = (raw: any): Snippet | null => {
  const id = String(raw?.id || "");
  if (!id) return null;

  return {
    id,
    name: String(raw?.name || id),
    args: String(raw?.args || ""),
    module: {
      value: String(raw?.module?.value || raw?.module || ""),
      label: String(raw?.module?.label || raw?.module || "")
    },
    variable: normalizeSnippetVariableDefinitions(raw?.variable),
    comment: String(raw?.comment || ""),
    createdBy: String(raw?.created_by || ""),
    scope: String(raw?.scope?.value || raw?.scope || "private") === "public" ? "public" : "private"
  };
};

export const useSnippets = () => {
  const userInfoStore = useUserInfoStore();
  const { loggedIn, currentAccountId } = storeToRefs(userInfoStore);
  const snippets = useState<Snippet[]>("sidebar-snippets", () => []);
  const loading = useState<boolean>("sidebar-snippets-loading", () => false);
  const saving = ref(false);

  const load = async () => {
    if (!loggedIn.value || loading.value) return;
    loading.value = true;
    try {
      const data = await getCommandSnippets();
      snippets.value = rawList(data)
        .map(normalizeSnippet)
        .filter((snippet): snippet is Snippet => !!snippet);
    } finally {
      loading.value = false;
    }
  };

  const save = async (payload: CommandSnippetPayload, id?: string) => {
    saving.value = true;
    try {
      const result = id ? await updateCommandSnippet(id, payload) : await createCommandSnippet(payload);
      await load();
      return result;
    } finally {
      saving.value = false;
    }
  };

  const loadVariableForm = async (id: string) =>
    normalizeSnippetVariableFields(await getCommandSnippetVariableForm(id));

  watch([loggedIn, currentAccountId], () => {
    snippets.value = [];
  });

  return { snippets, loading, saving, load, save, loadVariableForm };
};
