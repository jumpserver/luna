import type { FavoriteFolder } from "~/composables/useFavoriteFolders";
import { describe, expect, it, vi } from "vitest";
import {
  FAVORITE_FOLDER_NAME_MAX_LENGTH,
  hasFavoriteFolderName,
  isFavoriteFolderNameTooLong
} from "~/composables/useFavoriteFolders";

vi.mock("~/composables/useApiRequest", () => ({}));
vi.mock("~/store/modules/userInfo", () => ({ useUserInfoStore: vi.fn() }));

const folders: FavoriteFolder[] = [
  {
    id: "folder-1",
    name: "Production",
    parent: null,
    children: [
      {
        id: "folder-2",
        name: "Database",
        parent: "folder-1",
        children: [],
        assets: [],
        open: false
      }
    ],
    assets: [],
    open: false
  }
];

describe("favorite folder names", () => {
  it("finds duplicate names throughout the tree", () => {
    expect(hasFavoriteFolderName(folders, "Production")).toBe(true);
    expect(hasFavoriteFolderName(folders, " database ")).toBe(true);
    expect(hasFavoriteFolderName(folders, "production")).toBe(true);
  });

  it("excludes the folder being renamed", () => {
    expect(hasFavoriteFolderName(folders, "Production", "folder-1")).toBe(false);
    expect(hasFavoriteFolderName(folders, "Database", "folder-1")).toBe(true);
  });

  it("limits folder names to the supported length", () => {
    expect(isFavoriteFolderNameTooLong("a".repeat(FAVORITE_FOLDER_NAME_MAX_LENGTH))).toBe(false);
    expect(isFavoriteFolderNameTooLong("a".repeat(FAVORITE_FOLDER_NAME_MAX_LENGTH + 1))).toBe(true);
  });
});
