#!/usr/bin/env bash
# Assemble the Hugging Face Space repo for the cloud demo deploy (SS-247).
#
# Usage: deploy/hf-space/assemble.sh [media-dir] [documents-dir] [space-dir]
#   media-dir     default /tmp/sabz-demo-export/media      (from the
#                 sabz-system_api_product_media docker volume)
#   documents-dir default /tmp/sabz-demo-export/documents  (api_documents volume)
#   space-dir     default /tmp/sabz-demo-space
#
# Sources are taken from the CURRENT COMMIT via `git archive` — commit the
# deploy/hf-space artifacts first, or pass nothing and note that uncommitted
# edits to apps/**/packages/** are not picked up. The Space Dockerfile and
# start.sh always come from this directory (working tree).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"

MEDIA_DIR="${1:-/tmp/sabz-demo-export/media}"
DOCS_DIR="${2:-/tmp/sabz-demo-export/documents}"
SPACE_DIR="${3:-/tmp/sabz-demo-space}"

for dir in "$MEDIA_DIR" "$DOCS_DIR"; do
  if [ ! -d "$dir" ]; then
    echo "Missing $dir — export the docker volumes first (cloud-demo-deploy.md §2)." >&2
    exit 1
  fi
done

rm -rf "$SPACE_DIR"
mkdir -p "$SPACE_DIR"

# Sources exactly as committed: root manifests + workspace packages + the API
# (assets/prisma included; node_modules/dist/.data are untracked so excluded
# automatically) + the admin/storefront manifests pnpm's frozen lockfile needs.
git -C "$REPO_ROOT" archive HEAD \
  package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json \
  packages apps/api apps/admin/package.json apps/storefront/package.json \
  | tar -x -C "$SPACE_DIR"

# HF Docker Spaces require a root Dockerfile + README front-matter.
cp "$HERE/Dockerfile.space" "$SPACE_DIR/Dockerfile"
cp "$HERE/start.sh" "$SPACE_DIR/start.sh"
cp "$HERE/README.space.md" "$SPACE_DIR/README.md"

mkdir -p "$SPACE_DIR/media" "$SPACE_DIR/documents"
cp -a "$MEDIA_DIR/." "$SPACE_DIR/media/"
cp -a "$DOCS_DIR/." "$SPACE_DIR/documents/"

echo "Space repo assembled at $SPACE_DIR:"
du -sh "$SPACE_DIR" "$SPACE_DIR/media"
echo "Next: git init + push to the HF Space remote (cloud-demo-deploy.md §4)."
