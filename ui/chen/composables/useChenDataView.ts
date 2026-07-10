import type {
  ChenDataViewConsoleTab,
  ChenDataViewDataset,
  ChenPacket,
  ChenQueryResultTab
} from "~/chen/types";

export function useChenDataView() {
  function handleDataViewConsolePacket(tab: ChenDataViewConsoleTab, packet: ChenPacket) {
    switch (packet.type) {
      case "new_data_view":
        tab.meta = packet.data;
        tab.title = packet.data?.title || tab.title;
        break;
      case "update_data_view":
        tab.data = packet.data?.data || null;
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
    handleDataViewConsolePacket
  };
}
