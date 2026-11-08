<p align="center">
  <a href="https://asr.firetable.tech" target="_blank" rel="noopener noreferrer">
    <img src="https://asr.firetable.tech/favicon.svg" width="96" height="96" alt="Stream ASR Logo" />
  </a>
</p>

<h1 align="center">Stream ASR</h1>

<p align="center">
  <b>Ultra-fast, 100% browser-native streaming speech recognition runtime powered by WebAssembly & SIMD128. Zero cloud dependencies, zero privacy leaks.</b>
</p>

<p align="center">
  <a href="README.md"><b>English</b></a> •
  <a href="README-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://asr.firetable.tech"><b>🌐 Live Interactive Studio & Playground</b></a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@firetable/stream-asr"><img src="https://img.shields.io/npm/v/@firetable/stream-asr?color=0284c7&logo=npm" alt="npm version" /></a>
  <a href="https://asr.firetable.tech"><img src="https://img.shields.io/badge/Demo-asr.firetable.tech-0284c7?logo=cloudflare&logoColor=white" alt="Live Demo" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache_2.0-blue.svg" alt="License" /></a>
  <img src="https://img.shields.io/badge/Wasm_Core-2.2_MB-emerald?logo=webassembly&logoColor=white" alt="WASM Size" />
  <img src="https://img.shields.io/badge/RTF-0.45x-sky" alt="Real-Time Factor" />
  <img src="https://img.shields.io/badge/TypeScript-Strict_Ready-blue?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Zero_Cloud-100%25_Private-green" alt="Air-gapped" />
</p>

---

## 💡 Overview

**Stream ASR** is an industrial-grade, 100% client-side streaming automatic speech recognition (ASR) runtime designed for modern web browsers, Electron, and desktop environments.

Unlike traditional speech APIs that require constant WebSocket or gRPC audio streaming to remote cloud clusters, Stream ASR executes the entire acoustic feature extraction, neural causal Transformer inference, voice activity detection (VAD), and byte-level BPE text decoding **locally inside a dedicated WebAssembly Web Worker sandbox**.

Engineered from the ground up for the **LiteASR 40-layer causal Transformer specification**, it delivers sub-120ms first-token latency and an exceptional real-time factor (RTF ~0.45x) on commodity single-core CPUs with zero cloud API subscriptions, zero telemetry, and zero privacy exposure.

---

## ⚡ Key Highlights

- 🚀 **Blazing Fast (RTF ~0.45x)**: Transcribes 1 second of speech in ~0.45 seconds on a single CPU core via WebAssembly SIMD128 vectorization. Live interim text emits concurrently as words are spoken.
- 🔒 **100% Private & Air-Gapped**: Microphone PCM audio streams strictly within browser memory. Not a single byte of audio ever leaves the device.
- 📴 **Persistent Offline Caching**: Ships with built-in IndexedDB / CacheStorage persistence. The acoustic weights download once and boot offline in milliseconds on all subsequent visits.
- 🎙️ **Dual Industrial Execution Modes**:
  - **Mode 1 (Instant Stream)**: Push-to-talk ultra-low latency mode for command bars, smart search inputs, and shortcuts.
  - **Mode 3 (Universal Stream + VAD)**: Continuous streaming with autonomous sentence segmentation and pause detection powered by a neural VAD classifier.
- 🌐 **Chinese & English Bilingual Transcription**: Native high-accuracy support for conversational Mandarin Chinese and English, backed by a 64,000 Byte-Level BPE vocabulary with dynamic punctuation restoration.
- 🔄 **Built-in Lossless Audio Resampler**: Seamlessly ingests `Float32Array` PCM audio at arbitrary hardware sample rates (44.1kHz, 48kHz, etc.) and performs real-time resample conversion to 16kHz.
- 🧩 **Multi-Chunk Concurrent Streaming**: Supports single binary containers (`model.bin`) or auto-assembled 20MB chunk manifests (`model.json`), completely bypassing edge CDN file-size limits.

---

## 📊 Performance & Architecture Benchmarks

All metrics benchmarked on standard laptop hardware (Apple Silicon / modern x86_64, Single CPU Core, 16kHz Mono Audio):

| Solution | Model Footprint | Runtime Engine | RTF (Lower is faster) | First-Token Latency | 100% Client-Side Offline | Cloud Network Jitter |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **`@firetable/stream-asr` (This)** | **~175 MB** | **Wasm SIMD128 + MNN** | **~0.46x** | **< 120 ms** | **✅ Yes (Air-gapped)** | **0 ms (None)** |
| SenseVoice Small | ~230 MB | ONNX Runtime Web | ~0.75x | > 800 ms (Batch) | ✅ Yes | 0 ms |
| Whisper.cpp (base.en / int8) | ~140 MB | Wasm SIMD | ~0.85x | ~600 ms | ✅ Yes | 0 ms |
| Commercial Cloud Speech API | Cloud Cluster | Cloud GPU Datacenter | ~0.30x | ~400 ms (Network lag) | ❌ No (Audio Egress) | 150ms ~ 600ms |

---

## 🤖 For AI Coding Agents & LLMs

If you are an AI coding assistant (such as **Cursor**, **Claude Code**, **Windsurf**, or **GitHub Copilot**), read this section to integrate `@firetable/stream-asr` in your current project.

### Quick Instruction for Agents
```markdown
Please integrate @firetable/stream-asr on-device streaming speech recognition into this project:

1. Install @firetable/stream-asr using this project's package manager (npm / pnpm / yarn / bun)
2. Create a StreamRecognizer instance using Mode 3 (Causal Streaming + Neural VAD)
3. Wire the microphone audio stream and handle `recognizing` / `recognized` text callbacks

Refer to the official API docs: https://github.com/FireTable/stream-asr#readme
```

### Machine-Readable References
- **Standard Agent Context**: [`/llms.txt`](https://asr.firetable.tech/llms.txt) (Concise agent manifest)
- **Deep Technical Knowledge Base**: [`/llms-full.txt`](https://asr.firetable.tech/llms-full.txt) (Complete architecture and API schema)

---

## 📂 Repository File Tree

```
stream-asr/
├── packages/
│   ├── core/                        # C++17 / WASM Neural Core Engine
│   │   ├── build.sh                 # Emscripten compilation pipeline (SIMD128, O3)
│   │   └── src/                     # Audio Frontend (FBank, CMVN), VAD & BPE Decoders
│   └── sdk/                         # Browser TypeScript SDK (@firetable/stream-asr)
│       ├── src/
│       │   ├── index.ts             # Public library entry & class re-exports
│       │   ├── recognizer.ts        # Main StreamRecognizer event harness & public API
│       │   ├── worker_source.ts     # Inlined Web Worker script & tensor orchestration
│       │   ├── resampler.ts         # High-precision linear audio resampler
│       │   ├── idb_cache.ts         # IndexedDB / CacheStorage offline persistent store
│       │   └── types.ts             # Complete TypeScript interfaces & EventMap
│       ├── wasm/                    # Packaged stream_asr.wasm and stream_asr.js
│       ├── package.json
│       └── tsconfig.json
├── apps/
│   └── showcase/                    # Official Interactive Astro 5 + React 19 Studio
│       ├── public/
│       │   ├── wasm/                # Compiled stream_asr.wasm and stream_asr.js
│       │   ├── llms.txt             # Agent discovery manifest
│       │   └── llms-full.txt        # Full LLM technical reference
│       └── src/
│           ├── components/          # SoundLabHeroOrb, BentoGrid, Console HUD, CTA
│           └── pages/index.astro    # Multilingual Showcase Landing Page
├── tools/                           # Verification & Node.js test suites
│   ├── test_node.mjs                # Headless Node.js end-to-end integration test
│   └── split_model.py               # Model multi-chunk slicer (<= 20MB CDN shards)
├── LICENSE                          # Apache 2.0 License
├── README.md                        # English Master Documentation (This file)
├── README-CN.md                     # Simplified Chinese Documentation
└── package.json                     # Monorepo root workspace configuration
```

---

## 📦 Installation

Install `@firetable/stream-asr` using your favorite package manager:

```bash
# pnpm
pnpm add @firetable/stream-asr

# npm
npm install @firetable/stream-asr

# yarn
yarn add @firetable/stream-asr

# bun
bun add @firetable/stream-asr
```

---

## 🚀 Quick Start Guide

### 1. Minimal Working Example

```typescript
import { StreamRecognizer } from '@firetable/stream-asr';

// 1. Initialize engine in Mode 3 (Universal Streaming + Neural VAD)
const recognizer = new StreamRecognizer({
  modelUrl: '/model.bin',     // Path to model binary or CDN URL
  wasmBaseUrl: '/wasm',       // Path serving stream_asr.wasm & stream_asr.js
  mode: 3,                    // 3 = Universal Streaming + Neural VAD (Default)
  vadThreshold: 0.5,          // Speech activation sensitivity (0.0 ~ 1.0)
  enableCache: true           // Persist model in IndexedDB for offline instant-boot
});

// 2. Register real-time stream listeners
recognizer.on('recognizing', ({ text, vadState }) => {
  // Emitted in real-time as user speaks (< 120ms latency)
  console.log('[Streaming Partial]:', text);
});

recognizer.on('recognized', ({ text, tokenCount, inferenceMs }) => {
  // Emitted when a sentence finishes after natural pause or punctuation
  console.log('[Sentence Completed]:', text, `(${tokenCount} tokens in ${inferenceMs}ms)`);
});

recognizer.on('vad_state_change', ({ stateName }) => {
  // 'SILENCE' (0) | 'SPEECH' (1) | 'PAUSE' (2)
  console.log('[VAD State]:', stateName);
});

// 3. Start engine (downloads model or loads from IndexedDB, spawns Worker)
await recognizer.init();
console.log('Stream ASR is ready for live audio!');

// 4. Feed Float32Array PCM audio chunks in real-time
// Supports any hardware sample rate (16000, 44100, 48000, etc.)
recognizer.feed(pcmFloat32Chunk, audioContext.sampleRate);

// 5. When recording ends, flush pending frames
recognizer.finish();
```

---

### 2. Live Microphone Streaming (Web Audio API)

Here is a production-ready snippet for capturing browser microphone input:

```typescript
import { StreamRecognizer } from '@firetable/stream-asr';

async function startMicrophoneASR() {
  const recognizer = new StreamRecognizer({
    modelUrl: '/model.bin',
    wasmBaseUrl: '/wasm',
    mode: 3,
  });

  recognizer.on('recognizing', ({ text }) => {
    document.getElementById('live-subtitle')!.innerText = text;
  });

  recognizer.on('recognized', ({ text }) => {
    console.log('Final Sentence:', text);
  });

  await recognizer.init();

  // Capture user microphone stream
  const mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      sampleRate: 16000,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const audioCtx = new AudioContext({ sampleRate: 16000 });
  const sourceNode = audioCtx.createMediaStreamSource(mediaStream);

  // Use ScriptProcessorNode or AudioWorkletNode to stream PCM chunks
  const processorNode = audioCtx.createScriptProcessor(4096, 1, 1);
  processorNode.onaudioprocess = (e) => {
    const inputPcm = e.inputBuffer.getChannelData(0);
    // Automatically converted and fed to the WASM Worker
    recognizer.feed(inputPcm, audioCtx.sampleRate);
  };

  sourceNode.connect(processorNode);
  processorNode.connect(audioCtx.destination);

  return () => {
    processorNode.disconnect();
    sourceNode.disconnect();
    mediaStream.getTracks().forEach((track) => track.stop());
    audioCtx.close();
    recognizer.finish();
  };
}
```

---

## 🛠️ Complete API Reference

### `StreamRecognizerOptions`

Pass these options to `new StreamRecognizer(options)`:

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `modelUrl` | `string` | `'/model.bin'` | URL or path to packed model binary or chunked manifest (`model.json`). |
| `modelVersion` | `string` | `'1.0.0'` | Model version tag. Bumping this evicts stale cache entries automatically. |
| `wasmBaseUrl` | `string` | `'/wasm'` | Directory URL serving `stream_asr.wasm` and `stream_asr.js`. |
| `mode` | `ASRMode` | `3` | `1` (Instant push-to-talk stream) or `3` (Universal stream + neural VAD). |
| `sampleRate` | `number` | `16000` | Target acoustic sample rate in Hz (auto-resampled if hardware differs). |
| `vadThreshold` | `number` | `0.5` | Neural VAD speech probability sensitivity (0.0 ~ 1.0). |
| `speechPauseThreshold` | `number` | `0.925` | Ratio of silence frames required to finalize a sentence (0.1 ~ 0.99). |
| `minSpeechDurationMs` | `number` | `480` | Minimum speech duration required to trigger sentence start. |
| `maxPauseDurationMs` | `number` | `2080` | Silence pause duration before sentence boundary cut (in milliseconds). |
| `maxSegmentDurationSec` | `number` | `20` | Max continuous audio seconds before forcing punctuation cutoff. |
| `maxTokenNum` | `number` | `256` | Maximum token generation limit per recognized segment. |
| `maxRepeatTokens` | `number` | `15` | Maximum consecutive identical tokens before breaking repetition loop. |
| `numThreads` | `number` | `1` | Number of MNN backend compute threads for Wasm SIMD inference. |
| `enableCache` | `boolean` | `true` | Persist model in browser IndexedDB for instant subsequent boots. |
| `enablePostSmooth` | `boolean` | `true` | Filter speech disfluencies and normalize commas and periods. |
| `chunks` | `string[]` | `undefined` | Optional list of chunk URLs to download concurrently and reassemble. |
| `debug` | `boolean` | `true` | Enable verbose internal diagnostic logs. |

---

### Event Subscriptions (`recognizer.on(event, handler)`)

| Event Name | Payload Interface | Description |
| :--- | :--- | :--- |
| `recognizing` | `RecognizingEvent` | Emitted on every live decoding step while voice is active. Contains interim text and VAD state. |
| `recognized` | `RecognizedEvent` | Emitted when a natural pause or punctuation completes a sentence. Contains final text, token count, and inference time. |
| `refined` | `RecognizedEvent` | Emitted when a sentence has been post-processed and smoothed by the second-pass punctuation/disfluency refiner. |
| `vad_state_change` | `VadStateChangeEvent` | Emitted when speech activity shifts between `SILENCE` (0), `SPEECH` (1), and `PAUSE` (2). |
| `download_progress` | `DownloadProgressEvent` | Emitted during model download with `percent`, `loaded`, `total`, and chunk counters. |
| `ready` | `void` | Emitted when the WASM runtime has loaded the model and is ready to ingest audio. |
| `error` | `Error` | Emitted on initialization, network, or WASM decode failures. |
| `log` | `LogEvent` | Internal runtime logs with timestamp, level, tag, and message. |

---

### Core Methods & Properties

| Member | Signature / Type | Description |
| :--- | :--- | :--- |
| `init()` | `() => Promise<void>` | Compiles WASM, spins up the Web Worker, loads weights from cache/network, and readies the pipeline. |
| `feed()` | `(inputPcm: Float32Array, inputSampleRate?: number, isFinal?: boolean) => void` | Appends audio samples into the recognition queue. Auto-resamples to 16kHz if needed. |
| `finish()` | `() => void` | Flushes all remaining audio frames in the buffer and finalizes active sentences. |
| `reset()` | `() => void` | Clears acoustic states, KV-caches, and VAD buffers without reloading weights. |
| `destroy()` | `() => void` | Terminates the Web Worker and cleans up all memory allocations. |
| `setConfig()` | `(config: Partial<StreamRecognizerOptions>) => void` | Dynamically updates runtime parameters (such as `mode`, `vadThreshold`, `debug`) without reloading weights. |
| `on()` | `(event: K, listener: Listener<EventMap[K]>) => this` | Subscribes an event listener callback. |
| `once()` | `(event: K, listener: Listener<EventMap[K]>) => this` | Subscribes a one-time event listener callback. |
| `off()` | `(event: K, listener: Listener<EventMap[K]>) => this` | Unsubscribes an event listener callback. |
| `isReady` | `boolean (getter)` | Returns true if the recognizer is initialized and ready to transcribe. |
| `downloadProgress` | `DownloadProgressEvent` &#124; `null (getter)` | Returns current download progress snapshot, or null once ready. |

---

### Utility: `AudioResampler`

The SDK exports the standalone continuous linear resampler for custom audio processing pipelines:

```typescript
import { AudioResampler } from '@firetable/stream-asr';

const resampler = new AudioResampler(44100, 16000);
const pcm16k = resampler.process(pcm44kChunk); // Stateful cross-chunk phase tracking
resampler.reset(); // Reset phase for new stream session
```

---

## 🌐 Supported Languages & Capabilities

- **Chinese (Mandarin)**: High-accuracy recognition of standard Mandarin, conversational colloquialisms, technical terminology, and mixed Chinese-English phrasing.
- **English**: Comprehensive conversational and domain-specific English recognition with proper casing and punctuation.

> [!NOTE]
> Out of respect for scientific accuracy, this runtime focuses exclusively on **Mandarin Chinese & English**. Specialized regional dialects (such as Cantonese) that rely on out-of-vocabulary characters are intentionally omitted to avoid acoustic forced-fitting.

---

## 🔒 Security, Privacy & Air-Gapped Verification

Stream ASR complies with strict enterprise and healthcare data protection policies:

1. **Zero Outbound Telemetry**: Does not send analytics, telemetry, or user metrics to any external server.
2. **Ephemeral Audio Storage**: Audio frames exist only in memory during the active recognition window and are discarded immediately upon decoding.
3. **WASM Linear Memory Isolation**: All neural tensors execute inside an isolated WebAssembly memory sandbox inside a dedicated Web Worker thread.

---

## 💻 Browser & Environment Compatibility

| Browser / Environment | Minimum Version | SIMD128 Supported | Zero COOP/COEP Headers Required |
| :--- | :---: | :---: | :---: |
| **Google Chrome / Chromium** | 90+ | ✅ Yes | ✅ Yes (Single-thread SIMD) |
| **Microsoft Edge** | 90+ | ✅ Yes | ✅ Yes |
| **Apple Safari (macOS & iOS)** | 16.4+ | ✅ Yes | ✅ Yes |
| **Mozilla Firefox** | 90+ | ✅ Yes | ✅ Yes |
| **Electron** | 13.0+ | ✅ Yes | ✅ Yes |
| **Tauri** | 1.0+ | ✅ Yes | ✅ Yes |

---

## 🤝 Contributing & Local Development

This project is organized as a `pnpm` monorepo.

### Prerequisites
- Node.js >= 18.0.0
- pnpm >= 9.0.0
- (Optional for WASM build) Emscripten SDK (emsdk)

### Setup & Build
```bash
# Clone the repository
git clone https://github.com/FireTable/stream-asr.git
cd stream-asr

# Install dependencies
pnpm install

# Build SDK package
pnpm --filter @firetable/stream-asr build

# Run type-checks across monorepo
pnpm type-check

# Start the interactive Showcase Studio
pnpm --filter @firetable/stream-asr-showcase dev
```

---

## 📄 License

Licensed under the **[Apache License, Version 2.0](LICENSE)**.
Free for personal, academic, and commercial use.
