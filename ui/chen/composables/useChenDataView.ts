import type {
  ChenConsoleState,
  ChenDataViewAction,
  ChenDataViewActionTarget,
  ChenDataViewConsoleTab,
  ChenDataViewDataset,
  ChenPacket,
  ChenQueryResultTab,
  ChenWorkspaceTab
} from "~/chen/types";

export function getChenDataViewToolbarState(state: ChenConsoleState) {
  const loading = Boolean(state.loading);
  const paged = Boolean(state.paged);
  const page = Number.isFinite(state.page) && Number(state.page) > 0 ? Number(state.page) : 1;
  const limit = Number.isFinite(state.limit) && Number(state.limit) > 0 ? Number(state.limit) : 50;
  const total = Number.isFinite(state.total) && Number(state.total) > 0 ? Number(state.total) : 0;
  const lastPage = Math.max(1, Math.ceil(total / limit));
  const paginationUnavailable = loading || !paged;

  return {
    loading,
    paged,
    page,
    limit,
    total,
    lastPage,
    pinned: Boolean(state.pinned),
    disableFirst: paginationUnavailable || page <= 1,
    disablePrevious: paginationUnavailable || page <= 1,
    disableNext: paginationUnavailable || page >= lastPage,
    disableLast: paginationUnavailable || page >= lastPage
  };
}

export function useChenDataView(
  sendConsoleAction?: (tab: ChenWorkspaceTab, type: string, data?: any) => void
) {
  function sendDataViewAction(
    owner: ChenWorkspaceTab,
    target: ChenDataViewActionTarget,
    action: ChenDataViewAction,
    data?: number
  ) {
    const dataView = "kind" in target && target.kind === "data-view"
      ? target.meta?.title
      : target.title;
    if (!dataView) return;

    sendConsoleAction?.(owner, "data_view_action", {
      action,
      dataView,
      ...(data === undefined ? {} : { data })
    });
  }

  function handleDataViewConsolePacket(tab: ChenDataViewConsoleTab, packet: ChenPacket) {
    switch (packet.type) {
      case "new_data_view":
        tab.meta = packet.data;
        tab.title = packet.data?.title || tab.title;
        break;
      case "update_state":
        if (packet.data?.title === tab.meta?.title) {
          tab.state = packet.data;
        }
        break;
      case "update_data_view":
        if (packet.data?.title === tab.meta?.title) {
          tab.data = packet.data?.data || null;
        }
        break;
    }
  }

  function downloadDataViewCsv(result: ChenQueryResultTab | ChenDataViewConsoleTab) {
    const dataset: ChenDataViewDataset | null = "data" in result ? result.data : null;
    if (!dataset?.fields?.length) return;
    const header = dataset.fields.map((item) => item.name).join(",");
    const rows = (dataset.data || []).map((row) => {
      return dataset.fields.map((field) => JSON.stringify(row[field.name] ?? "")).join(",");
    });
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${result.title || "query-result"}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return {
    downloadDataViewCsv,
    handleDataViewConsolePacket,
    sendDataViewAction
  };
}
