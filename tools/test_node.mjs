import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const wasmJsPath = fs.existsSync(path.join(__dirname, '../packages/core/dist/stream_asr.js'))
  ? path.join(__dirname, '../packages/core/dist/stream_asr.js')
  : path.join(__dirname, '../packages/sdk/wasm/stream_asr.js');
const createStreamAsrModule = require(wasmJsPath);
let MODEL_BIN_PATH = path.join(__dirname, 'model.bin');
if (!fs.existsSync(MODEL_BIN_PATH)) {
  const altPath = path.join(__dirname, '../apps/showcase/public/model.bin');
  if (fs.existsSync(altPath)) {
    MODEL_BIN_PATH = altPath;
  }
}
const TEST_WAV_PATH = path.join(__dirname, 'test.wav');

function ensureDir(FS, filePath) {
  const dir = path.posix.dirname(filePath);
  const parts = dir.split('/').filter(Boolean);
  let cur = '';
  for (const p of parts) {
    cur += '/' + p;
    try {
      FS.mkdir(cur);
    } catch {
      // directory already exists
    }
  }
}

function unpackModelBin(mod, binPath, destRoot = '/model') {
  const fd = fs.openSync(binPath, 'r');
  const magicBuf = Buffer.alloc(4);
  fs.readSync(fd, magicBuf, 0, 4, 0);
  const magic = magicBuf.toString('utf8');
  if (magic !== 'STT1') {
    throw new Error(`Invalid model.bin magic: ${magic}`);
  }

  const lenBuf = Buffer.alloc(4);
  fs.readSync(fd, lenBuf, 0, 4, 4);
  const manifestLen = lenBuf.readUInt32LE(0);

  const manifestBuf = Buffer.alloc(manifestLen);
  fs.readSync(fd, manifestBuf, 0, manifestLen, 8);
  const manifest = JSON.parse(manifestBuf.toString('utf8'));

  const alignedManifestLen = (manifestLen + 7) & ~7;
  const dataBaseOffset = 8 + alignedManifestLen;
  console.log(`[Unpack] Found ${manifest.files.length} assets in model.bin (v${manifest.version})`);

  for (const file of manifest.files) {
    const raw = Buffer.alloc(file.size);
    if (file.size > 0) {
      fs.readSync(fd, raw, 0, file.size, dataBaseOffset + file.offset);
    }
    const targetPath = path.posix.join(destRoot, file.path);
    ensureDir(mod.FS, targetPath);
    mod.FS.writeFile(targetPath, raw);
  }
  fs.closeSync(fd);
  console.log(`[Unpack] Unpacked all models to ${destRoot}`);
}

async function main() {
  console.log('=== Testing @firetable/stream-asr Core Runtime ===');
  if (!fs.existsSync(MODEL_BIN_PATH)) {
    console.warn(`[Skip] Model container not found at ${MODEL_BIN_PATH}.`);
    console.warn('[Skip] Skipping local inference test in model-free environment (e.g. CI without weights).');
    process.exit(0);
  }
  const t0 = performance.now();
  const mod = await createStreamAsrModule();

  // 1. Unpack neutral container
  unpackModelBin(mod, MODEL_BIN_PATH, '/model');

  // 2. Initialize engine
  const rc = mod.ccall('stream_asr_init', 'number', ['string'], ['/model']);
  if (rc !== 0) {
    throw new Error(`stream_asr_init failed with code ${rc}`);
  }
  console.log(`stream_asr_init succeeded in ${(performance.now() - t0).toFixed(1)}ms`);

  // 3. Test dynamic config injection
  const testConfig = JSON.stringify({
    mode: 3,
    audio: { sample_rate: 16000, chunk_size: 1600, pre_emphasis: 0.97 },
    vad: { enabled: true, speech_prob_threshold: 0.5, speech_pause_threshold: 0.7 },
    decoder: { max_token_num: 256 }
  });
  const cfgRc = mod.ccall('stream_asr_load_config_json', 'number', ['string'], [testConfig]);
  console.log(`Dynamic config injection: rc=${cfgRc}`);

  // 4. Load test.wav
  const wavBuf = fs.readFileSync(TEST_WAV_PATH);
  const int16Samples = new Int16Array(wavBuf.buffer, wavBuf.byteOffset + 44, (wavBuf.byteLength - 44) >> 1);
  const floatSamples = new Float32Array(int16Samples.length);
  for (let i = 0; i < int16Samples.length; i++) {
    floatSamples[i] = int16Samples[i] / 32768.0;
  }
  const audioSec = floatSamples.length / 16000.0;
  console.log(`Loaded test.wav: ${floatSamples.length} samples (${audioSec.toFixed(2)}s)`);

  const sPtr = mod._malloc(floatSamples.length * 4);
  mod.HEAPF32.set(floatSamples, sPtr >> 2);

  // -------------------------------------------------------------
  // Test Mode 1: Instant Streaming (320ms / 5120 samples chunks)
  // -------------------------------------------------------------
  console.log('\n--- 1. Testing Mode 1: Instant Stream ---');
  mod._stream_asr_reset_stream();
  const chunkSize = 5120;
  const tStream0 = performance.now();
  let mode1Text = '';
  for (let off = 0; off < floatSamples.length; off += chunkSize) {
    const n = Math.min(chunkSize, floatSamples.length - off);
    const isFinal = off + n >= floatSamples.length ? 1 : 0;
    const strPtr = mod._stream_asr_accept_waveform(sPtr + off * 4, n, isFinal);
    mode1Text = mod.UTF8ToString(strPtr);
  }
  const streamWall = performance.now() - tStream0;
  console.log(`[Mode 1 Stream] Text: "${mode1Text}"`);
  console.log(`[Mode 1 Stream] Wall: ${streamWall.toFixed(1)}ms, RTF: ${(streamWall / (audioSec * 1000)).toFixed(3)}`);

  // -------------------------------------------------------------
  // Test Mode 2: Offline Recognition
  // -------------------------------------------------------------
  console.log('\n--- 2. Testing Mode 2: Offline Recognition ---');
  const tOff0 = performance.now();
  const offStrPtr = mod._stream_asr_decode_offline(sPtr, floatSamples.length);
  const mode2Text = mod.UTF8ToString(offStrPtr);
  const offWall = performance.now() - tOff0;
  console.log(`[Mode 2 Offline] Text: "${mode2Text}"`);
  console.log(`[Mode 2 Offline] Wall: ${offWall.toFixed(1)}ms, RTF: ${(offWall / (audioSec * 1000)).toFixed(3)}`);

  // -------------------------------------------------------------
  // Test Mode 3: Universal Stream with VAD
  // -------------------------------------------------------------
  console.log('\n--- 3. Testing Mode 3: Universal Stream + VAD ---');
  mod._stream_asr_reset_universal_stream();
  const tUniv0 = performance.now();
  let mode3Text = '';
  for (let off = 0; off < floatSamples.length; off += chunkSize) {
    const n = Math.min(chunkSize, floatSamples.length - off);
    const isFinal = off + n >= floatSamples.length ? 1 : 0;
    const strPtr = mod._stream_asr_accept_waveform_universal(sPtr + off * 4, n, isFinal);
    mode3Text = mod.UTF8ToString(strPtr);
  }
  const univWall = performance.now() - tUniv0;
  console.log(`[Mode 3 Universal Stream] Text: "${mode3Text}"`);
  console.log(`[Mode 3 Universal Stream] Wall: ${univWall.toFixed(1)}ms, RTF: ${(univWall / (audioSec * 1000)).toFixed(3)}`);

  // -------------------------------------------------------------
  // Test Mode 4: Universal Offline with VAD
  // -------------------------------------------------------------
  console.log('\n--- 4. Testing Mode 4: Universal Offline + VAD ---');
  const tUnivOff0 = performance.now();
  const univOffStrPtr = mod._stream_asr_decode_universal(sPtr, floatSamples.length);
  const mode4Text = mod.UTF8ToString(univOffStrPtr);
  const univOffWall = performance.now() - tUnivOff0;
  console.log(`[Mode 4 Universal Offline] Text: "${mode4Text}"`);
  console.log(`[Mode 4 Universal Offline] Wall: ${univOffWall.toFixed(1)}ms, RTF: ${(univOffWall / (audioSec * 1000)).toFixed(3)}`);

  mod._free(sPtr);

  // Assertion check
  const EXPECTED = '今天天气真不错，我们来测试一下离线语音识别模型的准确率和推理速度。';
  const passed = (mode1Text === EXPECTED) && (mode2Text === EXPECTED) && (mode3Text === EXPECTED) && (mode4Text === EXPECTED);

  console.log('\n========================================');
  if (passed) {
    console.log('✅ ALL 4 SINGLE-THREAD MODES PASSED WITH 100% TOKEN PARITY!');
  } else {
    console.error('❌ Mismatch detected against expected text!');
    process.exit(1);
  }
  console.log('========================================');

  // -------------------------------------------------------------
  // Test Multi-Threaded WASM (if available)
  // -------------------------------------------------------------
  const threadedJsPath = path.join(__dirname, '../packages/core/dist/stream_asr.threaded.js');
  if (fs.existsSync(threadedJsPath)) {
    console.log('\n\n=== Testing Multi-Threaded WASM Runtime (Pthreads) ===');
    const createThreadedModule = require(threadedJsPath);

    for (const numThreads of [2, 4]) {
      console.log(`\n--- Testing Multi-Worker with ${numThreads} Threads ---`);
      const tThr0 = performance.now();
      const thrMod = await createThreadedModule();
      unpackModelBin(thrMod, MODEL_BIN_PATH, '/model');

      thrMod.ccall('stream_asr_load_config_json', 'number', ['string'], [JSON.stringify({
        mode: 3,
        num_threads: numThreads
      })]);

      const thrRc = thrMod.ccall('stream_asr_init', 'number', ['string'], ['/model']);
      if (thrRc !== 0) {
        throw new Error(`stream_asr_init (threaded ${numThreads}) failed with code ${thrRc}`);
      }
      console.log(`[Threaded ${numThreads}T] init in ${(performance.now() - tThr0).toFixed(1)}ms`);

      const thrSPtr = thrMod._malloc(floatSamples.length * 4);
      thrMod.HEAPF32.set(floatSamples, thrSPtr >> 2);

      thrMod._stream_asr_reset_universal_stream();
      const tInfer0 = performance.now();
      let thrText = '';
      for (let off = 0; off < floatSamples.length; off += chunkSize) {
        const n = Math.min(chunkSize, floatSamples.length - off);
        const isFinal = off + n >= floatSamples.length ? 1 : 0;
        const strPtr = thrMod._stream_asr_accept_waveform_universal(thrSPtr + off * 4, n, isFinal);
        thrText = thrMod.UTF8ToString(strPtr);
      }
      const thrInferMs = performance.now() - tInfer0;
      const speedup = (univWall / thrInferMs).toFixed(2);
      console.log(`[Threaded ${numThreads}T] Text: "${thrText}"`);
      console.log(`[Threaded ${numThreads}T] Wall: ${thrInferMs.toFixed(1)}ms, RTF: ${(thrInferMs / (audioSec * 1000)).toFixed(3)} (${speedup}x speedup vs 1T)`);

      thrMod._free(thrSPtr);

      if (thrText !== EXPECTED) {
        console.error(`❌ Threaded ${numThreads}T text mismatch!`);
        process.exit(1);
      }
      console.log(`✅ [Threaded ${numThreads}T] 100% EXACT TOKEN MATCH!`);
    }
    console.log('\n========================================');
    console.log('🎉 ALL SINGLE-WORKER & MULTI-WORKER TESTS PASSED!');
    console.log('========================================');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
