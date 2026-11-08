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

EXPORTED_FUNCS='["_malloc","_free","_stream_asr_init","_stream_asr_load_config_json","_stream_asr_set_post_smooth","_stream_asr_set_two_pass","_stream_asr_reset_stream","_stream_asr_accept_waveform","_stream_asr_decode_offline","_stream_asr_get_decoded_token_count","_stream_asr_get_last_inference_ms","_stream_asr_reset_universal_stream","_stream_asr_accept_waveform_universal","_stream_asr_has_pending_refine","_stream_asr_run_pending_refine","_stream_asr_cancel_pending_refine","_stream_asr_decode_universal","_stream_asr_get_tail_vad_state","_stream_asr_is_speech_active"]'
EXPORTED_METHODS='["ccall","cwrap","UTF8ToString","HEAPU8","HEAPF32","FS"]'

echo "=== 1. Building stream_asr.wasm (Single-Thread Universal SIMD128) ==="

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
  -s EXPORTED_FUNCTIONS="$EXPORTED_FUNCS" \
  -s EXPORTED_RUNTIME_METHODS="$EXPORTED_METHODS" \
  -o "$DIST_DIR/stream_asr.js"

# 3. Build Multi-Threaded variant if threaded MNN library exists
MNN_THREADED_LIB="$MNN_ROOT/build-wasm-threaded/libMNN.a"
if [ -f "$MNN_THREADED_LIB" ]; then
  echo "=== 2. Building stream_asr.threaded.wasm (Multi-Threaded Pthreads SIMD128) ==="

  em++ -std=c++17 -O3 -msimd128 -msse4.1 -pthread \
    "$SCRIPT_DIR/src/stream_asr.cpp" \
    "$MNN_THREADED_LIB" \
    -I"$MNN_ROOT/include" -I"$MNN_ROOT/source" \
    -I"$SCRIPT_DIR/src" \
    -s WASM=1 \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s INITIAL_MEMORY=67108864 \
    -s MAXIMUM_MEMORY=2147483648 \
    -s MODULARIZE=1 \
    -s EXPORT_NAME="createStreamAsrModule" \
    -s FORCE_FILESYSTEM=1 \
    -s PTHREAD_POOL_SIZE=4 \
    -s PTHREAD_POOL_SIZE_STRICT=0 \
    -s EXPORTED_FUNCTIONS="$EXPORTED_FUNCS" \
    -s EXPORTED_RUNTIME_METHODS="$EXPORTED_METHODS" \
    -s INCOMING_MODULE_JS_API='["locateFile","onAbort","onRuntimeInitialized","mainScriptUrlOrBlob"]' \
    -o "$DIST_DIR/stream_asr.threaded.js"
fi

echo "=== Build Complete ==="
ls -lh "$DIST_DIR"/stream_asr*.js "$DIST_DIR"/stream_asr*.wasm

# 4. Synchronize build artifacts to SDK and Showcase
SDK_WASM_DIR="$SCRIPT_DIR/../sdk/wasm"
SHOWCASE_WASM_DIR="$SCRIPT_DIR/../../apps/showcase/public/wasm"

for TARGET in "$SDK_WASM_DIR" "$SHOWCASE_WASM_DIR"; do
  if [ -d "$TARGET" ]; then
    mkdir -p "$TARGET"
    cp "$DIST_DIR"/stream_asr*.js "$TARGET/"
    cp "$DIST_DIR"/stream_asr*.wasm "$TARGET/"
    echo "Deployed WASM artifacts to $TARGET"
  fi
done
