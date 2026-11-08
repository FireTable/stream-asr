#!/usr/bin/env bash
set -euo pipefail

# 1. Detect and load EMSDK
if [ -n "${EMSDK:-}" ] && [ -f "$EMSDK/emsdk_env.sh" ]; then
    source "$EMSDK/emsdk_env.sh" >/dev/null 2>&1
elif [ -f "/tmp/emsdk/emsdk_env.sh" ]; then
    source "/tmp/emsdk/emsdk_env.sh" >/dev/null 2>&1
elif [ -f "$HOME/emsdk/emsdk_env.sh" ]; then
    source "$HOME/emsdk/emsdk_env.sh" >/dev/null 2>&1
fi

if ! command -v em++ >/dev/null 2>&1; then
    echo "[Error] em++ not found in PATH. Please install or set EMSDK." >&2
    exit 1
fi

# 2. Detect MNN
MNN_ROOT="${MNN_ROOT:-/tmp/MNN}"
if [ ! -f "$MNN_ROOT/build-wasm/libMNN.a" ]; then
    echo "[Error] MNN static library not found at $MNN_ROOT/build-wasm/libMNN.a" >&2
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$SCRIPT_DIR/dist"
mkdir -p "$DIST_DIR"

echo "=== Building stream_asr.wasm (SIMD128 + MNN + Strip) ==="

em++ -std=c++17 -O3 -msimd128 -msse4.1 \
  "$SCRIPT_DIR/src/stream_asr.cpp" \
  "$MNN_ROOT/build-wasm/libMNN.a" \
  -I"$MNN_ROOT/include" -I"$MNN_ROOT/source" \
  -I"$SCRIPT_DIR/src" \
  -s WASM=1 \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s INITIAL_MEMORY=67108864 \
  -s MAXIMUM_MEMORY=2147483648 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME="createStreamAsrModule" \
  -s FORCE_FILESYSTEM=1 \
  -s EXPORTED_FUNCTIONS='["_malloc","_free","_stream_asr_init","_stream_asr_load_config_json","_stream_asr_set_post_smooth","_stream_asr_set_two_pass","_stream_asr_reset_stream","_stream_asr_accept_waveform","_stream_asr_decode_offline","_stream_asr_get_decoded_token_count","_stream_asr_get_last_inference_ms","_stream_asr_reset_universal_stream","_stream_asr_accept_waveform_universal","_stream_asr_has_pending_refine","_stream_asr_run_pending_refine","_stream_asr_cancel_pending_refine","_stream_asr_decode_universal","_stream_asr_get_tail_vad_state","_stream_asr_is_speech_active"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","UTF8ToString","HEAPU8","HEAPF32","FS"]' \
  -o "$DIST_DIR/stream_asr.js"

echo "=== Build Complete ==="
ls -lh "$DIST_DIR/stream_asr.js" "$DIST_DIR/stream_asr.wasm"

SHOWCASE_WASM_DIR="$SCRIPT_DIR/../../apps/showcase/public/wasm"
if [ -d "$SHOWCASE_WASM_DIR" ]; then
  mkdir -p "$SHOWCASE_WASM_DIR"
  cp "$DIST_DIR/stream_asr.js" "$SHOWCASE_WASM_DIR/stream_asr.js"
  cp "$DIST_DIR/stream_asr.wasm" "$SHOWCASE_WASM_DIR/stream_asr.wasm"
  echo "Deployed to $SHOWCASE_WASM_DIR"
fi
