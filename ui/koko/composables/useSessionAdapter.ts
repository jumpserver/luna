import type { OnlineUser, ShareUserOptions } from "#koko/types/session";
import type { MaybeRefOrGetter } from "vue";
import { FORMATTER_MESSAGE_TYPE } from "@jumpserver/connectors-core";

import { writeText } from "clipboard-polyfill";
import { useKokoConnectionStore } from "#koko/stores/connection";
import { formatMessage } from "#koko/utils/terminalUtils";

/**
 * Share/session view of a single Koko pane. The pane id is required so the
 * right panel and the in-terminal drawer always act on the terminal they show,
 * never on the most recently connected one.
 */
export function useKokoSessionAdapter(paneId: MaybeRefOrGetter<string>) {
  const { t } = useI18n();
  const toast = useToast();
  const { addErrorToast } = useErrorToast();
  const connectionStore = useKokoConnectionStore();

  const pane = computed(() => connectionStore.pane(toValue(paneId)));

  const onlineUsers = computed(() => pane.value.onlineUsers);

  const shareInfo = computed(() => {
    const { shareId, shareCode, sessionId, enableShare } = pane.value;
    const origin = globalThis.window?.location.origin || "";
    return {
      shareId,
      shareCode,
      sessionId,
      enableShare,
      shareURL: shareId ? `${origin}/luna/share/${shareId}?code=${encodeURIComponent(shareCode)}` : ""
    };
  });

  const userOptions = computed<ShareUserOptions[]>(() => pane.value.userOptions);

  const sendToPane = (type: FORMATTER_MESSAGE_TYPE, payload: unknown) => {
    const { socket, terminalId } = pane.value;
    if (!socket || !terminalId) return false;

    socket.send(formatMessage(terminalId, type, JSON.stringify(payload)));
    return true;
  };

  const createShareLink = (shareLinkRequest: {
    expiredTime: number;
    actionPerm: string;
    users: ShareUserOptions[];
  }) => {
    const sessionId = pane.value.sessionId;
    const sent =
      Boolean(sessionId) &&
      sendToPane(FORMATTER_MESSAGE_TYPE.TERMINAL_SHARE, {
        origin: window.location.origin,
        session: sessionId,
        users: shareLinkRequest.users,
        expired_time: shareLinkRequest.expiredTime,
        action_permission: shareLinkRequest.actionPerm
      });

    if (!sent) addErrorToast({ title: t("koko.terminal.failedCreateConnection") });
  };

  const searchUsers = (query: string) => {
    sendToPane(FORMATTER_MESSAGE_TYPE.TERMINAL_GET_SHARE_USER, { query });
  };

  const removeShareUser = (user: OnlineUser) => {
    const sessionId = pane.value.sessionId;
    if (!sessionId) return;

    sendToPane(FORMATTER_MESSAGE_TYPE.TERMINAL_SHARE_USER_REMOVE, { session: sessionId, user_meta: user });
  };

  const copyShareURL = () => {
    const { shareURL, enableShare } = shareInfo.value;
    if (!shareURL || !enableShare) return;

    writeText(shareURL)
      .then(() => toast.add({ title: t("koko.terminal.shareLinkCopied"), color: "success" }))
      .catch((error) => addErrorToast({ title: String(error) }));
  };

  const resetShareState = () => {
    connectionStore.updatePane(toValue(paneId), { shareId: "", shareCode: "" });
  };

  return {
    shareInfo,
    onlineUsers,
    userOptions,
    searchUsers,
    copyShareURL,
    createShareLink,
    removeShareUser,
    resetShareState
  };
}
