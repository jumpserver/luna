import type { SessionShareAdapter, SessionShareLinkRequest, SessionShareOnlineUser } from "@jumpserver/connectors-core";
import type { MaybeRefOrGetter } from "vue";
import type { ShareUserOptions } from "#koko/types/session";
import { FORMATTER_MESSAGE_TYPE } from "@jumpserver/connectors-core";

import { writeText } from "clipboard-polyfill";
import { useKokoConnectionStore } from "#koko/stores/connection";
import { formatMessage } from "#koko/utils/terminalUtils";
import { useShareLink } from "~/composables/useShareLink";

/**
 * Share/session view of a single Koko pane. The pane id is required so the
 * right panel and the in-terminal drawer always act on the terminal they show,
 * never on the most recently connected one.
 */
export function useKokoSessionAdapter(paneId: MaybeRefOrGetter<string>): SessionShareAdapter {
  const { t } = useI18n();
  const toast = useToast();
  const { addErrorToast } = useErrorToast();
  const connectionStore = useKokoConnectionStore();
  const { siteUrl, shareURL: buildShareURL } = useShareLink();

  const pane = computed(() => connectionStore.pane(toValue(paneId)));

  const onlineUsers = computed(() => pane.value.onlineUsers);
  const hasMoreUsers = computed(() => false);

  const shareInfo = computed(() => {
    const { shareId, shareCode, sessionId, enableShare } = pane.value;
    return {
      shareId,
      shareCode,
      sessionId,
      enableShare,
      shareURL: buildShareURL(shareId, shareCode, "koko")
    };
  });

  const userOptions = computed<ShareUserOptions[]>(() => pane.value.userOptions);

  const sendToPane = (type: FORMATTER_MESSAGE_TYPE, payload: unknown) => {
    const { socket, terminalId } = pane.value;
    if (!socket || !terminalId) return false;

    socket.send(formatMessage(terminalId, type, JSON.stringify(payload)));
    return true;
  };

  const createShareLink = (shareLinkRequest: SessionShareLinkRequest) => {
    const sessionId = pane.value.sessionId;
    const sent =
      Boolean(sessionId) &&
      sendToPane(FORMATTER_MESSAGE_TYPE.TERMINAL_SHARE, {
        origin: siteUrl.value,
        session: sessionId,
        users: shareLinkRequest.users.map((user) => user.id),
        expired_time: shareLinkRequest.expiredTime,
        action_permission: shareLinkRequest.actionPerm
      });

    if (!sent) addErrorToast({ title: t("koko.terminal.failedCreateConnection") });
  };

  const searchUsers = (query: string) => {
    sendToPane(FORMATTER_MESSAGE_TYPE.TERMINAL_GET_SHARE_USER, { query });
  };

  const removeShareUser = (user: SessionShareOnlineUser) => {
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
    hasMoreUsers,
    searchUsers,
    copyShareURL,
    createShareLink,
    removeShareUser,
    resetShareState
  };
}
