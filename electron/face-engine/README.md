# JumpServer Face Engine

This directory is the local Python sidecar used by the Electron client. It communicates with the Electron main process through newline-delimited JSON on stdin/stdout; it does not expose a TCP port.

## Development

```bash
uv sync --project electron/face-engine --group dev
pnpm face:test
```

InsightFace downloads the configured recognition model on first initialization unless `JMS_FACE_MODEL_ROOT` points to a pre-provisioned model directory.

## Packaging

Build the platform worker before packaging Electron:

```bash
pnpm face:build
JMS_FACE_ENGINE_BUNDLE=electron/face-engine/dist/facelive-worker pnpm electron:build
```

On Windows, use `facelive-worker.exe`. A release build must be produced separately for every supported OS and architecture.

To ship InsightFace models without a first-run download, point `JMS_FACE_MODEL_BUNDLE` at an InsightFace root directory containing `models/buffalo_l`:

```bash
JMS_FACE_ENGINE_BUNDLE=electron/face-engine/dist/facelive-worker \
JMS_FACE_MODEL_BUNDLE=/opt/jumpserver/insightface \
pnpm electron:build
```

The anti-spoofing ONNX model is intentionally not committed; configure and package an approved model for `onnx` or `hybrid` liveness in production.
