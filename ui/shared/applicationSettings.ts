import type { AppConfigType, ConfigItem } from "~/types";

export function matchesApplicationSearch(item: ConfigItem, query: string) {
  const text = [item.display_name, item.name, item.path, ...item.protocol].join(" ").toLowerCase();
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .every((term) => text.includes(term));
}

export function applicationSettingsGroups(config: AppConfigType | null | undefined) {
  const seen = new Set<string>();
  return (Object.entries(config || {}) as [keyof AppConfigType, ConfigItem[]][])
    .map(([category, items]) => ({
      category,
      items: items.filter((item) => {
        if (item.name === "builtin_client" || item.uses_terminal_host) return false;
        const key = item.plugin_id || `${category}:${item.name}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
    }))
    .filter((group) => group.items.length);
}
