#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
venv_dir="$repo_dir/.tts-venv"

python3 -m venv "$venv_dir"
"$venv_dir/bin/python" -m pip install --upgrade pip
"$venv_dir/bin/python" -m pip install --upgrade \
  torch torchaudio --index-url https://download.pytorch.org/whl/cu128
"$venv_dir/bin/python" -m pip install --upgrade qwen-tts soundfile

echo "Local Qwen TTS is ready: $venv_dir/bin/python"
