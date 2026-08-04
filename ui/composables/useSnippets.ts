import { useUserInfoStore } from "~/store/modules/userInfo";

export interface SnippetModule {
  value: string;
  label: string;
}

export interface Snippet {
  id: string;
  name: string;
  args: string;
  module: SnippetModule;
  variable: unknown[];
  comment: string;
  createdBy: string;
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
    variable: Array.isArray(raw?.variable) ? raw.variable : [],
    comment: String(raw?.comment || ""),
    createdBy: String(raw?.created_by || "")
  };
};

export const useSnippets = () => {
  const userInfoStore = useUserInfoStore();
  const { loggedIn, orgId } = storeToRefs(userInfoStore);
  const { batchCommand, setOpen } = useBatchCommandPanel();
  const snippets = useState<Snippet[]>("sidebar-snippets", () => []);
  const loading = useState<boolean>("sidebar-snippets-loading", () => false);

  const load = async () => {
    if (!loggedIn.value || loading.value) return;
    loading.value = true;
    try {
      const data = await getCommandSnippets();
      snippets.value = rawList(data).map(normalizeSnippet).filter((snippet): snippet is Snippet => !!snippet);
    } finally {
      loading.value = false;
    }
  };

  const applySnippet = (snippet: Snippet) => {
    batchCommand.value = snippet.args;
    setOpen(true);
  };

  watch([loggedIn, orgId], () => {
    snippets.value = [];
  });

  return { snippets, loading, load, applySnippet };
};
