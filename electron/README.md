# Electron desktop runtime

This directory contains the JumpServer desktop runtime.

Run the current development shell with:

```sh
pnpm electron:dev
```

Desktop development and packaging require Go 1.25 or newer to build the bundled `jms-ssh` helper.
On macOS, development builds ad-hoc sign the helper; release builds use `CSC_NAME` and verify the packaged helper before completing. Windows Authenticode signing is enabled when `WINDOWS_CERTIFICATE_FILE` (and `WINDOWS_CERTIFICATE_PASSWORD`) or `WINDOWS_SIGN_WITH_PARAMS` is configured.

The launcher allocates independent Nuxt and HMR ports, starts the renderer, and
then opens Electron through Electron Forge. TypeScript sources live under `src/`
by domain (`desktop`, `auth`, `apps`, `replay`, `web-proxy`). Vite compiles the
`bootstrap.ts` and `preload.ts` entries. The preload keeps context isolation and
the Chromium sandbox enabled. It exposes a deliberately narrow desktop bridge to
the UI.

Currently migrated:

- OAuth, encrypted token persistence, API session bootstrap, and organization switching;
- native windows, menus, tray, single-instance behavior, and protocol registration;
- settings storage, scoped filesystem access, dialogs, clipboard, and safe external links;
- Koko terminal/Kubernetes/SFTP, Lion RDP, Chen database, and secondary asset windows;
- local shell PTY sessions powered by `node-pty`;
- isolated Web Proxy views, one-time encrypted credential autofill, and Koko recording upload;
- scoped offline recording import, decompression, and local replay URLs;
- platform application plugins, external native-client launch, and system font enumeration;
- replay-to-MP4 conversion through the Node replay pipeline and optional FFmpeg plugin.

Remaining release work:

- cross-platform CI builds for macOS, Windows, and Linux;
- code signing/notarization and updater channel wiring.

Create a local unpacked production app with `pnpm electron:package:dir`, or build platform artifacts
with `pnpm electron:build`. Packaging uses Electron Forge makers: DMG/ZIP on macOS, Squirrel/WiX on
Windows, and DEB/RPM on Linux. Windows no longer uses NSIS, and Linux no longer produces AppImage.

Keep new renderer code runtime-neutral. Add native behavior to the preload/main
bridge rather than enabling Node.js integration or importing Electron from Vue
components.
