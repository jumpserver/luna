import type { ComputedRef, Ref } from "vue";

import type { SuggestionUser } from "@/lion/api";
import type {
  LionOnlineUser,
  LionSessionShareAdapter,
  LionShareLinkRequest
} from "@/lion/workspaces/useLionWorkspaceSessionRegistry";
import { createShareURL, getSuggestionUsers, removeShareUser } from "@/lion/api";
import { withBaseUrl } from "@/lion/utils/base";
import { writeClipboardText } from "@/utils/clipboard";

interface LionSessionShareSource {
  endpointUrl: ComputedRef<string>;
  enableShare: Ref<boolean>;
  onlineUsersMap: Ref<Record<string, LionOnlineUser>>;
  sessionObject: Ref<Record<string, any>>;
  ticket: Ref<string>;
  tokenId: Ref<string>;
  refreshTicket: () => Promise<string>;
}

const PAGE_SIZE = 10;

export function useLionSessionShareAdapter(source: LionSessionShareSource): LionSessionShareAdapter {
  const { t } = useI18n();
  const toast = useToast();
  const { addErrorToast } = useErrorToast();
  const shareId = ref("");
  const shareCode = ref("");
  const userOptions = ref<SuggestionUser[]>([]);
  const hasMoreUsers = ref(false);
  const currentQuery = ref("");
  const currentPage = ref(0);
  let searchGeneration = 0;

  const sessionId = computed(() => String(source.sessionObject.value?.id || ""));
  const onlineUsers = computed(() => Object.values(source.onlineUsersMap.value || {}).filter(Boolean));
  const shareURL = computed(() => {
    if (!shareId.value || !shareCode.value) return "";
    return withBaseUrl(
      `/lion/share/${shareId.value}?type=lion&code=${encodeURIComponent(shareCode.value)}`,
      source.endpointUrl.value
    );
  });
  const shareInfo = computed(() => ({
    shareId: shareId.value,
    shareCode: shareCode.value,
    sessionId: sessionId.value,
    enableShare: source.enableShare.value,
    shareURL: shareURL.value
  }));

  const normalizeUsers = (users: SuggestionUser[]) => {
    const seen = new Set<string>();
    return users.filter((user) => {
      if (!user?.id || seen.has(user.id)) return false;
      seen.add(user.id);
      return true;
    });
  };

  const searchUsers = async (value: string, loadMore = false) => {
    const query = value.trim();
    const page = loadMore && query === currentQuery.value ? currentPage.value + 1 : 1;
    const generation = loadMore ? searchGeneration : ++searchGeneration;

    if (!loadMore) {
      currentQuery.value = query;
      currentPage.value = 0;
      userOptions.value = [];
    }

    try {
      const response = await getSuggestionUsers(query, page, PAGE_SIZE);
      if (generation !== searchGeneration || query !== currentQuery.value) return;

      const paginated = !Array.isArray(response);
      const pageUsers = paginated ? response.results || [] : response;
      userOptions.value = normalizeUsers(loadMore ? [...userOptions.value, ...pageUsers] : pageUsers);
      currentPage.value = page;
      hasMoreUsers.value = paginated ? Boolean(response.next) : false;
    } catch (error) {
      if (generation !== searchGeneration) return;
      addErrorToast({ title: t("RightPanel.ShareSearchFailed"), description: String(error) });
    }
  };

  const authenticatedRequest = async () => {
    let ticket = source.ticket.value;
    try {
      ticket = (await source.refreshTicket()) || ticket;
    } catch (error) {
      if (!ticket) throw error;
    }
    return { ticket, token: source.tokenId.value };
  };

  const createShareLink = async (request: LionShareLinkRequest) => {
    if (!sessionId.value) {
      addErrorToast({ title: t("RightPanel.ShareSessionUnavailable") });
      return;
    }

    try {
      const response = await createShareURL(
        {
          session_id: sessionId.value,
          expired_time: request.expiredTime,
          users: request.users,
          action_perm: request.actionPerm
        },
        source.endpointUrl.value,
        await authenticatedRequest()
      );

      if (response.success === false || !response.id || !response.verify_code) {
        throw new Error(response.message || t("RightPanel.ShareCreateFailed"));
      }
      shareId.value = response.id;
      shareCode.value = response.verify_code;
    } catch (error) {
      addErrorToast({ title: t("RightPanel.ShareCreateFailed"), description: String(error) });
    }
  };

  const copyShareURL = async () => {
    if (!shareURL.value || !shareCode.value) return;
    try {
      await writeClipboardText(
        `${t("RightPanel.ShareLink")}: ${shareURL.value}\n${t("RightPanel.VerifyCode")}: ${shareCode.value}`
      );
      toast.add({ title: t("RightPanel.ShareCopySuccess"), color: "success" });
    } catch (error) {
      addErrorToast({ title: t("RightPanel.ShareCopyFailed"), description: String(error) });
    }
  };

  const removeUser = async (user: LionOnlineUser) => {
    try {
      const response = await removeShareUser(user, source.endpointUrl.value, await authenticatedRequest());
      if (response.success === false) throw new Error(response.message || t("RightPanel.ShareRemoveFailed"));
    } catch (error) {
      addErrorToast({ title: t("RightPanel.ShareRemoveFailed"), description: String(error) });
    }
  };

  const resetShareState = () => {
    shareId.value = "";
    shareCode.value = "";
  };

  watch(sessionId, (next, previous) => {
    if (previous && next !== previous) resetShareState();
  });

  return {
    sessionId,
    enableShare: source.enableShare,
    onlineUsers,
    shareInfo,
    userOptions,
    hasMoreUsers,
    searchUsers,
    createShareLink,
    copyShareURL,
    removeShareUser: removeUser,
    resetShareState
  };
}
