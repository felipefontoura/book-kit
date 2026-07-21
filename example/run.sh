#!/usr/bin/env bash
# Build the example book exactly as a consumer repo would: stage a throwaway
# "book" directory with the kit mounted at kit/ (submodule layout), then run
# the normal pipeline inside it. Outputs land in example/.build/dist/.
#
# Usage: bash example/run.sh [--pdf | --epub | --all]
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"   # example/
KIT="$(cd "$HERE/.." && pwd -P)"                          # repo root
STAGE="$HERE/.build"

mkdir -p "$STAGE/kit"

# Example content → stage root (the "book" repo)
tar -C "$HERE" --exclude=.build --exclude=run.sh -cf - . | tar -xf - -C "$STAGE"

# Kit → stage/kit (the "submodule")
tar -C "$KIT" --exclude=.git --exclude=node_modules --exclude=example -cf - . \
  | tar -xf - -C "$STAGE/kit"

# Reuse the kit's installed deps if present (build.sh installs them otherwise)
[[ -d "$KIT/node_modules" ]] && ln -sfn "$KIT/node_modules" "$STAGE/kit/node_modules"

cd "$STAGE"
bash kit/scripts/build.sh "${1:---all}"

echo ""
echo "Outputs in $STAGE/dist/"
