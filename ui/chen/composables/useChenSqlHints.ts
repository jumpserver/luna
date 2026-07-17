import type { ChenQueryConsoleTab, ChenSqlHints } from "~/chen/types";

export function useChenSqlHints(
  fetchHints: (tab: ChenQueryConsoleTab, context: string) => Promise<ChenSqlHints>,
  onError: (cause: unknown) => void = () => {}
) {
  async function load(tab: ChenQueryConsoleTab, context: string) {
    const generation = ++tab.hintsRequestGeneration;
    tab.hintsLoading = true;
    try {
      const hints = await fetchHints(tab, context);
      if (generation === tab.hintsRequestGeneration && context === tab.state.currentContext) {
        tab.sqlHints = hints;
        tab.hintsContext = context;
      }
    } catch (cause) {
      if (generation === tab.hintsRequestGeneration && context === tab.state.currentContext) {
        onError(cause);
      }
    } finally {
      if (generation === tab.hintsRequestGeneration) tab.hintsLoading = false;
    }
  }

  return { load };
}
