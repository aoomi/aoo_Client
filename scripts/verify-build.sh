#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
AOO_ROOT=$(cd "$ROOT/.." && pwd)
NODE="$AOO_ROOT/.toolchains/node-v24.19.0-darwin-arm64/bin/node"
TSC="/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript/lib/tsc.js"

[[ -x "$NODE" ]] || { echo "missing pinned Node 24.19.0: $NODE" >&2; exit 1; }
[[ -f "$TSC" ]] || { echo "missing Cocos Creator 3.8.8 TypeScript compiler: $TSC" >&2; exit 1; }
[[ -f "$AOO_ROOT/Admin/node_modules/typescript/lib/typescript.js" ]] || { echo "Admin dependencies are required for Client test fixtures" >&2; exit 1; }

cd "$ROOT"
"$NODE" scripts/verify-no-empty-asset-shells.mjs
"$NODE" scripts/verify-font-deduplication.mjs
"$NODE" scripts/verify-settlement-assets.mjs
"$NODE" "$TSC" --noEmit -p tsconfig.json
tests=()
while IFS= read -r test_file; do tests+=("$test_file"); done < <(find tests -type f \( -name '*.test.mjs' -o -name '*.test.ts' \) -print | LC_ALL=C sort)
(( ${#tests[@]} > 0 )) || { echo "no Client tests discovered" >&2; exit 1; }
"$NODE" --test "${tests[@]}"
