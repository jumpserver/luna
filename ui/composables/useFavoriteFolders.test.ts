import type { FavoriteFolder } from "~/composables/useFavoriteFolders";
import type { AssetItem } from "~/types";
import { describe, expect, it, vi } from "vitest";
import {
  FAVORITE_FOLDER_NAME_MAX_LENGTH,
  findFavoriteAssetFolderId,
  flattenFavoriteFolderTree,
  flattenVisibleFavoriteFolderTree,
  getFavoriteRootAssetCount,
  isFavoriteFolderNameTooLong,
  restoreFavoriteFolderOpenState,
  sortFavoriteFoldersByName,
  updateFavoriteFolderAssetCount
} from "~/composables/useFavoriteFolders";

vi.mock("~/composables/useApiRequest", () => ({}));
vi.mock("~/store/modules/userInfo", () => ({ useUserInfoStore: vi.fn() }));

const asset = (id: string): AssetItem => ({
  id,
  name: id,
  address: "",
  platform: "",
  zone: "",
  isActive: true,
  category: "",
  type: ""
});

describe("favorite folder names", () => {
  it("limits folder names to the supported length", () => {
    expect(isFavoriteFolderNameTooLong("a".repeat(FAVORITE_FOLDER_NAME_MAX_LENGTH))).toBe(false);
    expect(isFavoriteFolderNameTooLong("a".repeat(FAVORITE_FOLDER_NAME_MAX_LENGTH + 1))).toBe(true);
  });
});

describe("favorite folder asset counts", () => {
  it("includes direct assets and every descendant folder", () => {
    const folder = {
      id: "parent",
      name: "Parent",
      parent: null,
      assets: [asset("asset-1"), asset("asset-2")],
      assetCount: 0,
      open: false,
      children: [
        {
          id: "child",
          name: "Child",
          parent: "parent",
          assets: [asset("asset-3")],
          assetCount: 0,
          open: false,
          children: []
        }
      ]
    } satisfies FavoriteFolder;

    expect(updateFavoriteFolderAssetCount(folder)).toBe(3);
    expect(folder.assetCount).toBe(3);
    expect(folder.children[0]?.assetCount).toBe(1);
  });

  it("includes folderless legacy favorites in the virtual root count", () => {
    const folder = {
      id: "folder",
      name: "Folder",
      parent: null,
      assets: [asset("folder-asset")],
      assetCount: 1,
      open: false,
      children: []
    } satisfies FavoriteFolder;

    expect(getFavoriteRootAssetCount([folder], [asset("legacy-asset")])).toBe(2);
  });
});

describe("favorite folder tree menus", () => {
  const folders = [
    {
      id: "parent",
      name: "Parent",
      parent: null,
      assets: [],
      open: false,
      children: [
        {
          id: "child",
          name: "Child",
          parent: "parent",
          assets: [asset("asset-1")],
          open: false,
          children: []
        }
      ]
    }
  ] satisfies FavoriteFolder[];

  it("preserves folder depth in display order", () => {
    expect(flattenFavoriteFolderTree(folders).map(({ folder, depth }) => [folder.id, depth])).toEqual([
      ["parent", 1],
      ["child", 2]
    ]);
  });

  it("sorts folders by name within every parent", () => {
    const sorted = sortFavoriteFoldersByName([
      {
        id: "root-z",
        name: "Zulu",
        parent: null,
        assets: [],
        open: false,
        children: []
      },
      {
        id: "root-a",
        name: "Alpha",
        parent: null,
        assets: [],
        open: false,
        children: [
          {
            id: "child-z",
            name: "Zulu child",
            parent: "root-a",
            assets: [],
            open: false,
            children: []
          },
          {
            id: "child-a",
            name: "Alpha child",
            parent: "root-a",
            assets: [],
            open: false,
            children: []
          }
        ]
      }
    ] satisfies FavoriteFolder[]);

    expect(sorted.map((folder) => folder.id)).toEqual(["root-a", "root-z"]);
    expect(sorted[0]?.children.map((folder) => folder.id)).toEqual(["child-a", "child-z"]);
  });

  it("shows only descendants of folders expanded in the menu", () => {
    expect(flattenVisibleFavoriteFolderTree(folders, new Set()).map(({ folder }) => folder.id)).toEqual(["parent"]);
    expect(
      flattenVisibleFavoriteFolderTree(folders, new Set(["parent"])).map(({ folder, depth }) => [folder.id, depth])
    ).toEqual([
      ["parent", 1],
      ["child", 2]
    ]);
  });

  it("restores expanded folders after the tree is reloaded", () => {
    const reloaded = structuredClone(folders);
    reloaded[0]!.open = false;
    reloaded[0]!.children[0]!.open = false;

    restoreFavoriteFolderOpenState(reloaded, new Set(["parent"]));

    expect(reloaded[0]?.open).toBe(true);
    expect(reloaded[0]?.children[0]?.open).toBe(false);
  });

  it("finds both nested and virtual-root asset locations", () => {
    expect(findFavoriteAssetFolderId("asset-1", folders, [])).toBe("child");
    expect(findFavoriteAssetFolderId("root-asset", folders, [asset("root-asset")])).toBeNull();
    expect(findFavoriteAssetFolderId("missing", folders, [])).toBeUndefined();
  });
});
