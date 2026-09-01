import { useLocalStorage } from "@vueuse/core";

const STORAGE_KEY = "jumpserver-client:sftp-show-hidden-files";

export function isSftpHiddenEntryName(name: string) {
  return name !== ".." && name.startsWith(".");
}

export function useSftpShowHiddenFiles() {
  const showHiddenFiles = useLocalStorage(STORAGE_KEY, false);

  function filterHiddenEntries<T extends { name: string }>(entries: T[]) {
    if (showHiddenFiles.value) return entries;
    return entries.filter((entry) => !isSftpHiddenEntryName(entry.name));
  }

  return {
    showHiddenFiles,
    filterHiddenEntries
  };
}
