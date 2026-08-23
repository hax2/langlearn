#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -d .venv ]]; then
  echo "Missing .venv. Run ./scripts/setup_transcriber.sh first." >&2
  exit 1
fi

. .venv/bin/activate

cuda_lib_path="$(
  python - <<'PY'
from __future__ import annotations

import importlib.util
from pathlib import Path

libs = []
for package in ("nvidia.cublas", "nvidia.cudnn"):
    spec = importlib.util.find_spec(package)
    if not spec or not spec.submodule_search_locations:
        continue
    root = Path(next(iter(spec.submodule_search_locations)))
    lib = root / "lib"
    if lib.exists():
        libs.append(str(lib))

print(":".join(libs))
PY
)"

if [[ -n "$cuda_lib_path" ]]; then
  export LD_LIBRARY_PATH="${cuda_lib_path}${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
fi

python scripts/transcribe.py "$@"
