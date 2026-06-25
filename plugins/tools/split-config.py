#!/usr/bin/env python3
"""Split go-client/config.json into plugins/builtin/*."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = ROOT / "go-client" / "config.json"
BUILTIN_DIR = ROOT / "plugins" / "builtin"
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

# (name, category) -> plugin id
PLUGIN_IDS: dict[tuple[str, str], str] = {
    ("terminal", "databases"): "builtin.terminal-db",
    ("iterm", "filetransfer"): "builtin.iterm-sftp",
    ("windows_rdm", "remotedesktop"): "builtin.windows-rdm",
    ("another_redis", "databases"): "builtin.another-redis",
    ("mongo_compass", "databases"): "builtin.mongo-compass",
    ("navicat17", "databases"): "builtin.navicat17",
    ("ssms17", "databases"): "builtin.ssms17",
}


def plugin_id(name: str, category: str) -> str:
    key = (name, category)
    if key in PLUGIN_IDS:
        return PLUGIN_IDS[key]
    return f"builtin.{name.replace('_', '-')}"


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
                pid = plugin_id(name, category)
                if pid not in plugins:
                    plugins[pid] = {
                        "name": name,
                        "category": category,
                        "platforms": {},
                        "defaults": {"platforms": {}},
                        # use first seen item for manifest fields
                        "manifest_source": item,
                        "protocols": set(item.get("protocol", [])),
                    }
                else:
                    plugins[pid]["protocols"].update(item.get("protocol", []))

                plugins[pid]["platforms"][os_key] = platform_config(item)
                plugins[pid]["defaults"]["platforms"][os_key] = {
                    "match_first": item.get("match_first", []),
                    "is_default": item.get("is_default", False),
                    "is_set": item.get("is_set", False),
                    "is_internal": item.get("is_internal", False),
                    "path": item.get("path", ""),
                }

    return plugins


def write_plugin(pid: str, data: dict) -> None:
    src = data["manifest_source"]
    plugin_dir = BUILTIN_DIR / pid
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
    if any(
        data["platforms"].get(os, {}).get("launch", {}).get("type") == "autoit"
        for os in OS_KEYS
    ):
        manifest["permissions"] = ["autoit", "exec"]

    connect = {"platforms": data["platforms"]}
    defaults = data["defaults"]

    (plugin_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (plugin_dir / "connect.json").write_text(
        json.dumps(connect, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (plugin_dir / "defaults.json").write_text(
        json.dumps(defaults, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    icon_name = ICON_MAP.get(data["name"])
    if icon_name:
        src_icon = IMAGES_DIR / f"{icon_name}.png"
        if src_icon.is_file():
            shutil.copy2(src_icon, plugin_dir / "icon.png")


def build_selections(config: dict, plugin_index: list[dict]) -> dict[str, str]:
    """Build category:protocol -> plugin_id from match_first."""
    id_by_name_cat: dict[tuple[str, str], str] = {
        (e["name"], e["category"]): e["id"] for e in plugin_index
    }
    selections: dict[str, str] = {}

    for os_key in OS_KEYS:
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
        "version": config.get("version", 8) + 1,
        "windowBounds": config.get("windowBounds", {"width": 1664, "height": 1040}),
        "defaultSetting": config.get(
            "defaultSetting", {"theme": "light", "layout": "list", "language": "en"}
        ),
        "_plugins": {
            "enabled": True,
            "builtin_dir": "plugins/builtin",
            "state_file": "plugins-state.json",
        },
    }


def main() -> None:
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    plugins = collect_plugins(config)

    if BUILTIN_DIR.exists():
        shutil.rmtree(BUILTIN_DIR)
    BUILTIN_DIR.mkdir(parents=True)

    plugin_index = []
    for pid in sorted(plugins.keys()):
        write_plugin(pid, plugins[pid])
        plugin_index.append(
            {
                "id": pid,
                "name": plugins[pid]["name"],
                "category": plugins[pid]["category"],
                "platforms": sorted(plugins[pid]["platforms"].keys()),
            }
        )

    (BUILTIN_DIR / "index.json").write_text(
        json.dumps({"version": 1, "plugins": plugin_index}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    selections = build_selections(config, plugin_index)
    state_defaults = {
        "version": 1,
        "selections": selections,
        "plugins": {},
    }
    (ROOT / "plugins" / "plugins-state.defaults.json").write_text(
        json.dumps(state_defaults, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    slim = slim_config(config)
    CONFIG_PATH.write_text(
        json.dumps(slim, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print(f"Created {len(plugin_index)} builtin plugins in {BUILTIN_DIR}")
    for p in plugin_index:
        print(f"  - {p['id']} ({', '.join(p['platforms'])})")


if __name__ == "__main__":
    main()
