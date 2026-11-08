/**
 * Web Worker script code string for dedicated ASR thread execution.
 */
export const WORKER_SCRIPT = `
let mod = null;
let mode = 3;
let sPtr = 0;
let sCapacity = 0;
let isDebug = true;
let lastLoggedVad = -1;
let lastStreamText = '';
let chunkCount = 0;

const TAG_STYLES = {
  INIT: 'background: #0284c7; color: #fff; font-weight: bold; border-radius: 3px; padding: 1px 5px;',
  AUDIO: 'background: #0d9488; color: #fff; font-weight: bold; border-radius: 3px; padding: 1px 5px;',
  VAD: 'background: #6366f1; color: #fff; font-weight: bold; border-radius: 3px; padding: 1px 5px;',
  STREAM: 'background: #10b981; color: #fff; font-weight: bold; border-radius: 3px; padding: 1px 5px;',
  SEGMENT: 'background: #f59e0b; color: #000; font-weight: bold; border-radius: 3px; padding: 1px 5px;',
  TWOPASS: 'background: #a855f7; color: #fff; font-weight: bold; border-radius: 3px; padding: 1px 5px;'
};

function logDebug(tag, message, data) {
  if (!isDebug) return;
  const now = Date.now();
  const timeStr = new Date(now).toTimeString().split(' ')[0] + '.' + String(now % 1000).padStart(3, '0');
  const style = TAG_STYLES[tag] || 'color: #38bdf8; font-weight: bold;';
  if (data !== null && data !== undefined) {
    console.log('%c ' + tag + ' %c ' + timeStr + ' ' + message, style, 'color: inherit;', data);
  } else {
    console.log('%c ' + tag + ' %c ' + timeStr + ' ' + message, style, 'color: inherit;');
  }
  try {
    self.postMessage({
      type: 'LOG',
      payload: { timestamp: now, level: 'debug', tag, message, data }
    });
  } catch(e) {}
}

function ensureDir(FS, filePath) {
  const parts = filePath.split('/').filter(Boolean);
  parts.pop(); // remove filename
  let cur = '';
  for (const p of parts) {
    cur += '/' + p;
    try { FS.mkdir(cur); } catch(e) {}
  }
}

function unpackModelBin(mod, arrayBuffer, destRoot = '/model') {
  const dv = new DataView(arrayBuffer);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== 'STT1') {
    throw new Error('Invalid model.bin magic: ' + magic);
  }
  const manifestLen = dv.getUint32(4, true);
  const manifestBytes = new Uint8Array(arrayBuffer, 8, manifestLen);
  const manifestStr = new TextDecoder('utf-8').decode(manifestBytes);
  const manifest = JSON.parse(manifestStr);

  const alignedManifestLen = (manifestLen + 7) & ~7;
  const dataBaseOffset = 8 + alignedManifestLen;

  for (const file of manifest.files) {
    const raw = new Uint8Array(arrayBuffer, dataBaseOffset + file.offset, file.size);
    const targetPath = destRoot + '/' + file.path;
    ensureDir(mod.FS, targetPath);
    mod.FS.writeFile(targetPath, raw);
  }
}

self.onmessage = async (e) => {
  const { type, payload } = e.data;

  try {
    if (type === 'INIT') {
      const { wasmJsUrl, wasmBaseUrl, modelBuffer, config } = payload;
      if (config && config.debug !== undefined) isDebug = !!config.debug;

      logDebug('INIT', 'Loading WASM runtime from ' + wasmJsUrl + '...');
      const tInit0 = performance.now();
      importScripts(wasmJsUrl);
      mod = await createStreamAsrModule({
        mainScriptUrlOrBlob: wasmJsUrl,
        locateFile: (path) => {
          if (wasmBaseUrl && path.endsWith('.wasm')) {
            const cleanBase = wasmBaseUrl.endsWith('/') ? wasmBaseUrl.slice(0, -1) : wasmBaseUrl;
            return cleanBase + '/' + path;
          }
          return path;
        }
      });
      unpackModelBin(mod, modelBuffer, '/model');
      logDebug('INIT', 'Unpacked 18 assets from model.bin into MEMFS.');

      // CRITICAL: Configure before init so MNN initializes RuntimeManager with requested thread count!
      if (config) {
        mod.ccall('stream_asr_load_config_json', 'number', ['string'], [JSON.stringify(config)]);
        if (config.mode) mode = config.mode;
        if (typeof config.enablePostSmooth === 'boolean') {
          mod._stream_asr_set_post_smooth(config.enablePostSmooth ? 1 : 0);
        }
      }

      const rc = mod.ccall('stream_asr_init', 'number', ['string'], ['/model']);
      if (rc !== 0) {
        throw new Error('stream_asr_init failed with code ' + rc);
      }

      const threadCount = (config && (config.num_threads || config.numThreads)) ? (config.num_threads || config.numThreads) : 1;
      const isMultiWorker = threadCount > 1;
      const initMs = (performance.now() - tInit0).toFixed(1);
      logDebug('INIT', 'WASM Core & Neural VAD ready in ' + initMs + 'ms (Mode ' + mode + ', ' + (isMultiWorker ? ('Multi-Worker: ' + threadCount + ' Threads') : 'Single-Worker') + ')');

      self.postMessage({ type: 'READY', payload: { threads: threadCount, isMultiWorker } });
    }
    else if (type === 'CONFIG') {
      if (payload && payload.debug !== undefined) isDebug = !!payload.debug;
      if (mod) {
        mod.ccall('stream_asr_load_config_json', 'number', ['string'], [JSON.stringify(payload)]);
        if (payload.mode) mode = payload.mode;
        if (typeof payload.enablePostSmooth === 'boolean') {
          mod._stream_asr_set_post_smooth(payload.enablePostSmooth ? 1 : 0);
        }
      }
    }
    else if (type === 'RESET') {
      lastLoggedVad = -1;
      lastStreamText = '';
      chunkCount = 0;
      if (mod) {
        if (mode === 3 || mode === 4) {
          mod._stream_asr_reset_universal_stream();
        } else {
          mod._stream_asr_reset_stream();
        }
      }
      logDebug('AUDIO', 'Recognizer session reset.');
    }
    else if (type === 'FEED_AUDIO') {
      if (!mod) return;
      const { samples, isFinal } = payload;
      chunkCount++;
      const n = samples.length;
      if (n > sCapacity) {
        if (sPtr) mod._free(sPtr);
        sCapacity = Math.max(n * 2, 32768);
        sPtr = mod._malloc(sCapacity * 4);
      }
      mod.HEAPF32.set(samples, sPtr >> 2);

      let textPtr = 0;
      if (mode === 3) {
        textPtr = mod._stream_asr_accept_waveform_universal(sPtr, n, isFinal ? 1 : 0);
      } else {
        textPtr = mod._stream_asr_accept_waveform(sPtr, n, isFinal ? 1 : 0);
      }

      const text = mod.UTF8ToString(textPtr);
      const vadState = mod._stream_asr_get_tail_vad_state();
      const tokenCount = mod._stream_asr_get_decoded_token_count();
      const inferenceMs = mod._stream_asr_get_last_inference_ms();

      if (vadState !== lastLoggedVad) {
        lastLoggedVad = vadState;
        const stateName = vadState === 1 ? 'SPEECH' : vadState === 2 ? 'PAUSE' : 'SILENCE';
        logDebug('VAD', 'State changed -> ' + stateName + ' (state=' + vadState + ')');
      }

      if (text && text !== lastStreamText) {
        lastStreamText = text;
        logDebug('STREAM', 'Chunk #' + chunkCount + ' (' + inferenceMs.toFixed(1) + 'ms): "' + text + '" (tokens=' + tokenCount + ')');
      }

      if (isFinal) {
        logDebug('SEGMENT', 'Sentence ended (isFinal=1): "' + text + '"');
        lastStreamText = '';
      }

      self.postMessage({
        type: 'RESULT',
        payload: { text, vadState, isFinal, isRefined: false, tokenCount, inferenceMs }
      });
    }
    else if (type === 'DESTROY') {
      if (sPtr) {
        mod._free(sPtr);
        sPtr = 0;
      }
    }
  } catch (err) {
    self.postMessage({ type: 'ERROR', error: err.message || String(err) });
  }
};
`;
