import type { SidebarSectionVisibility } from "~/types";

export const SIDEBAR_SECTION_KEYS = ["assets", "favorites", "snippets"] as const;

export const DEFAULT_SIDEBAR_SECTIONS: SidebarSectionVisibility = {
  assets: true,
  favorites: true,
  snippets: true
};

const hasVisibleSections = (sections: SidebarSectionVisibility) => Object.values(sections).some(Boolean);

export const normalizeSidebarSections = (
  value?: Partial<SidebarSectionVisibility & { recent?: boolean }> | null
): SidebarSectionVisibility => {
  const { recent: _recent, ...rest } = value || {};
  const normalized = {
    ...DEFAULT_SIDEBAR_SECTIONS,
    ...rest
  };

  return hasVisibleSections(normalized) ? normalized : { ...DEFAULT_SIDEBAR_SECTIONS };
};
