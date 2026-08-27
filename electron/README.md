# Electron desktop runtime

This directory contains the JumpServer Client desktop runtime.

Run the current development shell with:

```sh
pnpm electron:dev
```

The launcher allocates independent Nuxt and HMR ports, starts the renderer, and
then opens Electron. The preload keeps context isolation and the Chromium
sandbox enabled. It exposes a deliberately narrow desktop bridge to the UI.

Currently migrated:

- OAuth, encrypted token persistence, API session bootstrap, and organization switching;
- native windows, menus, tray, single-instance behavior, and protocol registration;
- settings storage, scoped filesystem access, dialogs, clipboard, and safe external links;
- Koko terminal/Kubernetes/SFTP, Lion RDP, Chen database, and secondary asset windows;
- local shell PTY sessions powered by `node-pty`;
- isolated Web Proxy views, one-time encrypted credential autofill, and Koko recording upload;
- scoped offline recording import, decompression, and local replay URLs;
- platform application plugins, external native-client launch, and system font enumeration;
- replay-to-MP4 conversion through the shared native H.264 codec sidecar.

Remaining release work:

- cross-platform CI builds for macOS, Windows, and Linux;
- code signing/notarization and updater channel wiring.

Create a local unpacked production app with `pnpm electron:package:dir`, or build platform artifacts
with `pnpm electron:build`.

Keep new renderer code runtime-neutral. Add native behavior to the preload/main
bridge rather than enabling Node.js integration or importing Electron from Vue
components.
