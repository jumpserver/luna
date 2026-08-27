# Electron migration map

The Vue/Nuxt UI remains shared by Web, Tauri, and Electron. Desktop-only calls must go through
`ui/shared/desktop/bridge.ts`; workspace code should depend on its workspace host adapter instead of
detecting Electron directly.

## Main framework

| Capability | Electron implementation | Status |
| --- | --- | --- |
| Runtime detection and IPC | isolated preload API (`__JMS_DESKTOP__`) | migrated |
| OAuth, encrypted token persistence, session bootstrap | `electron/auth.mjs` | migrated |
| Core REST API proxy and organization switching | `electron/auth.mjs` | migrated |
| Window controls, menus, tray, desktop events | `electron/main.mjs` | migrated |
| Settings store, dialogs, clipboard, opener, app/OS info | Desktop Bridge adapters | migrated |
| Secondary asset windows | Desktop Bridge window adapter | migrated |
| External native-client launch and plugin management | `electron/application-config.mjs`, `electron/local-app-launcher.mjs` | migrated |
| System font enumeration | `electron/system-fonts.mjs` | migrated |

## Workspace order

| Order | Workspace | Native capabilities | Status |
| --- | --- | --- | --- |
| 1 | Koko terminal / Kubernetes | connect ticket, websocket session, clipboard | migrated through Koko Host Adapter |
| 2 | Koko SFTP / file editor | scoped local filesystem, dialogs, transfers | migrated through Koko Host Adapter |
| 3 | Lion RDP | connect ticket, endpoint selection, text/image clipboard | migrated through Desktop Bridge |
| 4 | Chen database | data grid clipboard and export downloads | migrated through Desktop Bridge |
| 5 | Local Shell / Script Editor | PTY process, resize, input/output, lifecycle | migrated with node-pty |
| 6 | Web Proxy | isolated browser, proxy lifecycle, secure autofill, recording | migrated through Desktop Bridge |
| 7 | Replay / transcode | recording import, local media URLs, native H.264 progress | migrated; Electron invokes the shared native codec sidecar |

Each workspace is considered migrated when it has no direct `useTauri*` calls, runs through a host
adapter in Electron and Tauri, keeps a functional Web fallback where applicable, and passes its focused
tests plus an Electron smoke test.

The workspace and local packaging migration is complete. `electron-builder` packages the generated
renderer, platform plugins, SSH helper, and `jms-transcode` sidecar, while the Electron runtime uses a
minimal package manifest so frontend build dependencies are not shipped.

The remaining work is release infrastructure: add the cross-platform CI matrix, connect platform code
signing/notarization, and wire published artifacts into the existing release/update channel.
