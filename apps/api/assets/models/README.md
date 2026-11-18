# Local background-removal model

## Model

- **Architecture:** U-2-Net (salient object detection / dichotomous image segmentation).
- **Weights:** `u2net.onnx` from the rembg v0.0.0 release asset.
- **Source URL:** https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx
- **SHA-256:** `8d10d2f3bb75ae3b6d527c77944fc5e7dcd94b29809d47a739a7a728a912b491`
- **Size:** ~168 MB (168,140,xxx bytes reported by GitHub).
- **Upstream license:** U-2-Net is Apache-2.0
  (https://github.com/xuebinqin/U-2-Net). The release host (rembg) redistributes
  the weights; keep this attribution with any deployment.
- **Runtime:** `onnxruntime-node` (MIT), CPU execution provider. No GPU and no
  remote inference call is required.

## Provisioning

Weights are not committed to Git. Provision them on the API host/volume:

```bash
pnpm --filter @sabz/api model:provision
# optional override:
BACKGROUND_REMOVAL_MODEL_PATH=/srv/sabz/models/u2net.onnx \
  pnpm --filter @sabz/api model:provision
```

The script verifies the pinned SHA-256 before atomically renaming the file.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `BACKGROUND_REMOVAL_ENABLED` | `true` | Master switch; when false uploads skip segmentation. |
| `BACKGROUND_REMOVAL_MODEL_PATH` | `assets/models/u2net.onnx` | Local weights path. |
| `WATERMARK_LOGO_ONLY` | `true` | Logo-only transparent PNG mark (brief requirement). |
| `WATERMARK_LOGO_OPACITY` | `0.85` | Alpha multiplier for the logo-only mark. |

## Resource requirements

- CPU: any x86-64/ARM64 supported by onnxruntime-node; a modern core runs a
  320×320 inference in roughly 0.3–2 seconds.
- Memory: ~500 MB transient (model + tensors); no persistent worker.
- Disk: ~168 MB model + product media.
- Inference is synchronous during upload in this milestone. If upload latency
  becomes the bottleneck, move the same service behind a durable queue without
  changing its contract.

## Failure posture

Missing weights, missing native runtime, quality-gate failure, corrupt input,
or inference errors never publish a damaged derivative. The upload keeps the
original, records `processingStatus = SKIPPED/FAILED` and a Persian operator
message, and the admin can preview/reprocess explicitly.
