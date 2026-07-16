#!/usr/bin/env python3
"""Split go-client/config.json into platform-scoped plugins."""

from __future__ import annotations

import os
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = Path(os.environ.get("CONFIG_PATH", ROOT / "go-client" / "config.json"))
OUTPUT_CONFIG_PATH = Path(os.environ.get("OUTPUT_CONFIG_PATH", ROOT / "go-client" / "config.json"))
PLUGINS_DIR = ROOT / "plugins"
IMAGES_DIR = ROOT / "ui" / "assets" / "images"

OS_KEYS = ("windows", "macos", "linux")
CATEGORIES = ("terminal", "remotedesktop", "filetransfer", "databases")

# name -> image filename (without extension)
ICON_MAP: dict[str, str] = {
    "iterm": "item2",
    "putty": "putty",
    "xshell": "xshell",
    "securecrt": "securecrt",
    "mobaxterm": "mobaxterm",
    "mstsc": "mstsc",
    "windows_rdm": "windows_rdm",
    "tigervnc": "tigerVnc",
    "realvnc": "realvnc",
    "winscp": "winscp",
    "securefx": "securecrt",
    "xftp": "xftp",
    "navicat17": "navicat17",
    "plsql": "plsql",
    "dbeaver": "dbeaver",
    "heidisql": "heidisql",
    "resp": "resp",
    "ssms17": "ssms17",
    "another_redis": "another_redis",
    "toad": "toad",
    "mongo_compass": "mongodb",
    "terminal": "terminal",
    "remmina": "remmina",
    "xfreerdp": "xfreerdp",
}

# (name, category) -> plugin id suffix
PLUGIN_IDS: dict[tuple[str, str], str] = {
    ("terminal", "databases"): "terminal-db",
    ("iterm", "filetransfer"): "iterm-sftp",
    ("windows_rdm", "remotedesktop"): "windows-rdm",
    ("another_redis", "databases"): "another-redis",
    ("mongo_compass", "databases"): "mongo-compass",
    ("navicat17", "databases"): "navicat17",
    ("ssms17", "databases"): "ssms17",
}


def plugin_suffix(name: str, category: str) -> str:
    key = (name, category)
    if key in PLUGIN_IDS:
        return PLUGIN_IDS[key]
    return name.replace("_", "-")


def plugin_id(os_key: str, name: str, category: str) -> str:
    return f"{os_key}.{plugin_suffix(name, category)}"


def executable_type(item: dict) -> str:
    if item.get("is_internal"):
        path = (item.get("path") or "").strip()
        if path and ("/" in path or "\\" in path or path.endswith(".exe")):
            # absolute or relative exe path shipped / system
            if path.startswith("C:") or path.startswith("/"):
                return "system"
        return "bundled" if item.get("is_internal") else "user_path"
    return "user_path"


def build_launch(item: dict) -> dict:
    autoit = item.get("autoit")
    if autoit:
        return {"type": "autoit", "steps": autoit}

    arg_format = item.get("arg_format") or ""

    if arg_format.strip() == "{file}":
        ext = "rdp" if "rdp" in item.get("protocol", []) else "vnc"
        path = (item.get("path") or "").strip()
        # .app bundle or empty path → OS opens the file (macOS RDP)
        use_system = not path or path.endswith(".app")
        launch: dict = {
            "type": "file",
            "extension": ext,
            "open_with": "system" if use_system else "executable",
        }
        if not use_system:
            launch["arg_template"] = "{file}"
        return launch

    if arg_format.strip() == "":
        return {"type": "args", "template": ""}

    return {"type": "args", "template": arg_format}


def platform_config(item: dict) -> dict:
    exe_type = executable_type(item)
    cfg = {
        "match_first": item.get("match_first", []),
        "is_default": item.get("is_default", False),
        "is_set": item.get("is_set", False),
        "is_internal": item.get("is_internal", False),
        "executable": {
            "type": exe_type,
            "default": item.get("path") or "",
        }
    }
    if exe_type == "user_path":
        cfg["executable"]["required"] = not bool((item.get("path") or "").strip())

    launch = build_launch(item)
    cfg["launch"] = launch

    display = item.get("display_name")
    if display:
        cfg["display_name"] = display

    return cfg


def collect_plugins(config: dict) -> dict[str, dict]:
    """Group config items by plugin id."""
    plugins: dict[str, dict] = {}

    for os_key in OS_KEYS:
        os_cfg = config.get(os_key, {})
        for category in CATEGORIES:
            for item in os_cfg.get(category, []):
                name = item["name"]
                pid = plugin_id(os_key, name, category)
                if pid not in plugins:
                    plugins[pid] = {
                        "name": name,
                        "category": category,
                        "os_key": os_key,
                        "connect": None,
                        # use first seen item for manifest fields
                        "manifest_source": item,
                        "protocols": set(item.get("protocol", [])),
                    }
                else:
                    plugins[pid]["protocols"].update(item.get("protocol", []))

                plugins[pid]["connect"] = {
                    "platform": os_key,
                    **platform_config(item),
                }

    return plugins


def write_plugin(pid: str, data: dict) -> None:
    src = data["manifest_source"]
    plugin_dir = PLUGINS_DIR / data["os_key"] / pid
    plugin_dir.mkdir(parents=True, exist_ok=True)

    manifest = {
        "id": pid,
        "name": data["name"],
        "display_name": src["display_name"],
        "version": "1.0.0",
        "min_client_version": "4.0.0",
        "author": "JumpServer",
        "homepage": "https://github.com/jumpserver/clients",
        "download_url": src.get("download_url", ""),
        "category": data["category"],
        "protocols": sorted(data["protocols"]),
        "builtin": True,
        "comment": src.get("comment", {"en": "", "zh": ""}),
    }
    if data["connect"].get("launch", {}).get("type") == "autoit":
        manifest["permissions"] = ["autoit", "exec"]

    connect = data["connect"]

    (plugin_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (plugin_dir / "connect.json").write_text(
        json.dumps(connect, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    icon_name = ICON_MAP.get(data["name"])
    if icon_name:
        src_icon = IMAGES_DIR / f"{icon_name}.png"
        if src_icon.is_file():
            shutil.copy2(src_icon, plugin_dir / "icon.png")


def build_selections(config: dict, os_key: str, plugin_index: list[dict]) -> dict[str, str]:
    """Build category:protocol -> plugin_id from match_first."""
    id_by_name_cat: dict[tuple[str, str], str] = {
        (e["name"], e["category"]): e["id"] for e in plugin_index
    }
    selections: dict[str, str] = {}

    os_cfg = config.get(os_key, {})
    for category in CATEGORIES:
        for item in os_cfg.get(category, []):
            for proto in item.get("match_first", []):
                key = f"{category}:{proto}"
                pid = id_by_name_cat.get((item["name"], category))
                if pid and key not in selections:
                    selections[key] = pid
    return selections


def slim_config(config: dict) -> dict:
    return {
        "filename": config.get("filename", "Jumpserve Clients Config"),
        "version": max(config.get("version", 8) + 1, 11),
        "windowBounds": config.get("windowBounds", {"width": 1664, "height": 1040}),
        "defaultSetting": config.get(
            "defaultSetting", {"theme": "light", "layout": "list", "language": "en"}
        ),
        "_plugins": {
            "enabled": True,
            "builtin_dir": "plugins",
            "state_file": "plugins-state.json",
        },
    }


def main() -> None:
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    plugins = collect_plugins(config)

    for os_key in OS_KEYS:
        platform_dir = PLUGINS_DIR / os_key
        if platform_dir.exists():
            shutil.rmtree(platform_dir)
        platform_dir.mkdir(parents=True)

    plugins_by_os: dict[str, list[dict]] = {os_key: [] for os_key in OS_KEYS}

    for pid in sorted(plugins.keys()):
        write_plugin(pid, plugins[pid])
        plugins_by_os[plugins[pid]["os_key"]].append(
            {
                "id": pid,
                "name": plugins[pid]["name"],
                "category": plugins[pid]["category"],
            }
        )

    for os_key, plugin_index in plugins_by_os.items():
        plugin_index = sorted(plugin_index, key=lambda item: item["id"])
        platform_dir = PLUGINS_DIR / os_key
        (platform_dir / "index.json").write_text(
            json.dumps({"version": 1, "plugins": plugin_index}, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        state_defaults = {
            "version": 1,
            "selections": build_selections(config, os_key, plugin_index),
            "plugins": {},
        }
        (platform_dir / "plugins-state.defaults.json").write_text(
            json.dumps(state_defaults, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )

    slim = slim_config(config)
    OUTPUT_CONFIG_PATH.write_text(
        json.dumps(slim, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    total = sum(len(items) for items in plugins_by_os.values())
    print(f"Created {total} platform plugins in {PLUGINS_DIR}")
    for os_key, plugin_index in plugins_by_os.items():
        print(f"  {os_key}: {len(plugin_index)} plugins")


if __name__ == "__main__":
    main()
