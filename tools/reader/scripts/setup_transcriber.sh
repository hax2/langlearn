#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements-transcribe.txt

cat <<'MSG'

Transcriber environment is ready.

Try:
  ./scripts/transcribe_gpu.sh "Vanguardia_revolucionaria_frente_a_política_sindical.m4a" --model medium --vtt
  python scripts/build_library.py

GPU diagnostic:
  nvidia-smi

If CUDA runs out of memory, retry with:
  ./scripts/transcribe_gpu.sh audio.m4a --model small --compute-type int8_float16

CPU fallback:
  . .venv/bin/activate
  python scripts/transcribe.py audio.m4a --device cpu --compute-type int8
MSG
