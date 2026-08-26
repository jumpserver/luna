import type { OnlineUser, ShareUserOptions } from "#koko/types/session";
import { FORMATTER_MESSAGE_TYPE } from "@jumpserver/connectors-core";

import { writeText } from "clipboard-polyfill";
import { storeToRefs } from "pinia";
import { useKokoConnectionStore } from "#koko/stores/connection";
import mittBus from "#koko/utils/mittBus";
import { formatMessage } from "#koko/utils/terminalUtils";

export function useKokoSessionAdapter() {
  const { t } = useI18n();
  const toast = useToast();
  const { addErrorToast } = useErrorToast();
  const connectionStore = useKokoConnectionStore();

  const onlineUsers = computed(() => connectionStore.onlineUsers || []);

  const shareInfo = computed(() => {
    const shareId = connectionStore.shareId || "";
    const origin = import.meta.client ? window.location.origin : "";
    return {
      shareId,
      shareCode: connectionStore.shareCode || "",
      sessionId: connectionStore.sessionId || "",
      enableShare: connectionStore.enableShare || false,
      shareURL: shareId ? `${origin}/luna/share/${shareId}/?code=${connectionStore.shareCode}` : ""
    };
  });

  const userOptions = computed<ShareUserOptions[]>(() => connectionStore.userOptions || []);

  const createShareLink = (shareLinkRequest: {
    expiredTime: number;
    actionPerm: string;
    users: ShareUserOptions[];
  }) => {
    const { socket, terminalId } = storeToRefs(connectionStore);
    const sessionId = connectionStore.sessionId;

    if (!socket?.value || !terminalId?.value || !sessionId) {
      addErrorToast({ title: t("koko.terminal.failedCreateConnection") });
      return;
    }

    socket.value.send(
      formatMessage(
        terminalId.value,
        FORMATTER_MESSAGE_TYPE.TERMINAL_SHARE,
        JSON.stringify({
          origin: window.location.origin,
          session: sessionId,
          users: shareLinkRequest.users,
          expired_time: shareLinkRequest.expiredTime,
          action_permission: shareLinkRequest.actionPerm
        })
      )
    );
  };

  const searchUsers = (query: string) => {
    const { socket, terminalId } = storeToRefs(connectionStore);
    if (!socket?.value || !terminalId?.value) return;

    socket.value.send(
      formatMessage(terminalId.value, FORMATTER_MESSAGE_TYPE.TERMINAL_GET_SHARE_USER, JSON.stringify({ query }))
    );
  };

  const removeShareUser = (user: OnlineUser) => {
    if (!connectionStore.sessionId) return;

    mittBus.emit("remove-share-user", {
      sessionId: connectionStore.sessionId,
      userMeta: user,
      type: "remove"
    });
  };

  const copyShareURL = () => {
    const { shareId, shareCode, enableShare } = shareInfo.value;
    if (!shareId || !enableShare) return;

    const origin = window.location.origin;
    const url = `${origin}/luna/share/${shareId}`;
    const text = `${t("koko.terminal.shareLink")}: ${url}\n${t("koko.terminal.verificationCode")}: ${shareCode}`;

    writeText(text)
      .then(() => toast.add({ title: t("koko.terminal.shareLinkCopied"), color: "success" }))
      .catch((error) => addErrorToast({ title: String(error) }));
  };

  const resetShareState = () => {
    connectionStore.updateConnectionState({ shareId: "", shareCode: "" });
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
