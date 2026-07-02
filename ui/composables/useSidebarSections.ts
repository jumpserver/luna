import type { SidebarSectionVisibility } from "~/types";

export const SIDEBAR_SECTION_KEYS = ["assets", "favorites", "recent", "snippets"] as const;

export const DEFAULT_SIDEBAR_SECTIONS: SidebarSectionVisibility = {
  assets: true,
  favorites: true,
  recent: true,
  snippets: true
};

const hasVisibleSections = (sections: SidebarSectionVisibility) =>
  Object.values(sections).some(Boolean);

export const normalizeSidebarSections = (
  value?: Partial<SidebarSectionVisibility> | null
): SidebarSectionVisibility => {
  const normalized = {
    ...DEFAULT_SIDEBAR_SECTIONS,
    ...(value || {})
  };

  return hasVisibleSections(normalized)
    ? normalized
    : { ...DEFAULT_SIDEBAR_SECTIONS };
};
