import type {
  ChenConsoleState,
  ChenDataViewAction,
  ChenDataViewActionData,
  ChenDataViewActionTarget,
  ChenDataViewConsoleTab,
  ChenPacket,
  ChenSaveChangesPayload,
  ChenWorkspaceTab
} from "~/chen/types";

import {
  acceptChenDataViewResponse,
  beginChenDataViewRequest,
  finishChenDataViewRequest,
  finishChenDataViewRequestWithoutData,
  transitionChenDataViewRequest
} from "~/chen/utils/dataViewEditing";

const DATA_REQUEST_ACTIONS = new Set<ChenDataViewAction>([
  "first_page",
  "prev_page",
  "next_page",
  "last_page",
  "refresh",
  "change_limit"
]);

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
  sendConsoleAction?: (tab: ChenWorkspaceTab, type: string, data?: any) => boolean | void
) {
  function sendDataViewAction(
    owner: ChenWorkspaceTab,
    target: ChenDataViewActionTarget,
    action: ChenDataViewAction,
    data?: ChenDataViewActionData
  ) {
    const dataView = "kind" in target && target.kind === "data-view" ? target.meta?.title : target.title;
    if (!dataView) return false;

    const state = target.editState;
    let request = null;
    let requestData = data;
    if (DATA_REQUEST_ACTIONS.has(action)) {
      request = beginChenDataViewRequest(state, "data");
    } else if (action === "save_changes_preview") {
      if (state.refreshRequiredBeforeSave || !data || typeof data !== "object") return false;
      request = beginChenDataViewRequest(state, "preview", data as ChenSaveChangesPayload);
      requestData = request?.payload || undefined;
    } else if (action === "save_changes") {
      const active = state.activeRequest;
      if (!active) return false;
      request = transitionChenDataViewRequest(state, active.sequence, "confirm", "save");
      requestData = request?.payload || undefined;
    }
    if (
      (DATA_REQUEST_ACTIONS.has(action) || action === "save_changes_preview" || action === "save_changes") &&
      !request
    ) {
      return false;
    }

    const sent = sendConsoleAction?.(owner, "data_view_action", {
      action,
      dataView,
      ...(requestData === undefined ? {} : { data: requestData })
    });
    if (sent === false && request) {
      finishChenDataViewRequest(state, request.sequence, request.kind);
      if (action === "save_changes_preview" || action === "save_changes") state.pendingSavePayload = null;
      return false;
    }
    return true;
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
          if (packet.data?.loading === false) finishChenDataViewRequestWithoutData(tab.editState);
        }
        break;
      case "update_data_view":
        if (packet.data?.title === tab.meta?.title && acceptChenDataViewResponse(tab.editState)) {
          tab.data = packet.data?.data || null;
        }
        break;
    }
  }

  return {
    handleDataViewConsolePacket,
    sendDataViewAction
  };
}
