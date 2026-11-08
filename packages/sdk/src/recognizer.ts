import {
  StreamRecognizerOptions,
  EventMap,
  Listener,
  ASRMode,
  VadStateCode,
  VadStateName,
  DownloadProgressEvent
} from './types.js';
import { WORKER_SCRIPT } from './worker_source.js';
import { getCachedModel, setCachedModel, isValidModelBuffer } from './idb_cache.js';
import { AudioResampler } from './resampler.js';

/**
 * Ultra-fast, 100% browser-native streaming speech recognition runtime.
 * Runs in an isolated Web Worker powered by WebAssembly SIMD128.
 *
 * Supports both single-binary model container (`/model.bin`) and multi-chunk
 * parallel downloading (`/model_chunks/model.json`) with auto-stitching and
 * persistent IndexedDB offline caching.
 *
 * @example
 * ```ts
 * import { StreamRecognizer } from '@firetable/stream-asr';
 *
 * // 1. Zero-config instantiation (defaults to /model.bin & /wasm)
 * const recognizer = new StreamRecognizer();
 *
 * // Or with parallel chunks for ultra-fast download:
 * // const recognizer = new StreamRecognizer({ modelUrl: '/model_chunks/model.json' });
 *
 * recognizer.on('download_progress', ({ percent, loaded, total }) => {
 *   console.log(`Downloading model: ${percent}%`);
 * });
 *
 * recognizer.on('recognizing', ({ text }) => console.log('Interim:', text));
 * recognizer.on('recognized', ({ text }) => console.log('Final:', text));
 *
 * await recognizer.init();
 *
 * recognizer.feed(pcmFloat32Array, audioContext.sampleRate);
 * recognizer.finish();
 * ```
 */
export class StreamRecognizer {
  private options: StreamRecognizerOptions;
  private worker: Worker | null = null;
  private resampler: AudioResampler | null = null;
  private listeners: Map<keyof EventMap, Set<Function>> = new Map();
  private initialized: boolean = false;
  private lastVadState: number = -1;
  private latestProgress: DownloadProgressEvent | null = null;

  constructor(options: StreamRecognizerOptions = {}) {
    this.options = {
      modelUrl: '/model.bin',
      wasmBaseUrl: '/wasm',
      modelVersion: '1.0.0',
      mode: 3,
      debug: true,
      sampleRate: 16000,
      maxTokenNum: 256,
      vadThreshold: 0.5,
      enableCache: true,
      enablePostSmooth: true,
      ...options
    };
  }

  /**
   * Whether the WebAssembly runtime and acoustic model are fully initialized and ready to transcribe.
   */
  public get isReady(): boolean {
    return this.initialized;
  }

  /**
   * Current model download progress state (if currently downloading), or null if loaded from cache.
   */
  public get downloadProgress(): DownloadProgressEvent | null {
    return this.latestProgress;
  }

  /**
   * Subscribes to a runtime event.
   * @param event Event name to listen to.
   * @param listener Callback function invoked when the event fires.
   * @returns The instance for method chaining.
   */
  public on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
    return this;
  }

  /**
   * Subscribes to a runtime event for a single invocation.
   * Automatically unbinds after the event is triggered once.
   * @param event Event name to listen to.
   * @param listener Callback function invoked when the event fires.
   * @returns The instance for method chaining.
   */
  public once<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): this {
    const onceWrapper = ((data: EventMap[K]) => {
      this.off(event, onceWrapper as Listener<EventMap[K]>);
      (listener as any)(data);
    }) as Listener<EventMap[K]>;
    return this.on(event, onceWrapper);
  }

  /**
   * Unsubscribes a listener from a runtime event.
   * @param event Event name to remove listener from.
   * @param listener The callback function reference to unbind.
   * @returns The instance for method chaining.
   */
  public off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): this {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(listener);
    }
    return this;
  }

  private emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const fn of Array.from(set)) {
        try {
          (fn as any)(data);
        } catch (e) {
          console.error('[StreamRecognizer] Listener error:', e);
        }
      }
    }
  }

  /**
   * Initializes the engine, downloads/fetches the model (or loads from IndexedDB cache),
   * instantiates the background Web Worker, and compiles the WebAssembly SIMD core.
   *
   * @returns Promise that resolves when the engine is 100% ready to transcribe.
   * @throws Error if model download fails, wasm is missing, or Worker crashes.
   */
  public async init(): Promise<void> {
    if (this.initialized) return;

    // 1. Resolve absolute URLs for browser / worker safety
    let rawModelUrl = this.options.modelUrl || '/model.bin';
    let resolvedModelUrl = rawModelUrl;
    if (typeof window !== 'undefined' && window.location && !resolvedModelUrl.startsWith('http://') && !resolvedModelUrl.startsWith('https://')) {
      resolvedModelUrl = new URL(resolvedModelUrl, window.location.origin).href;
    }

    const rawBase = this.options.wasmBaseUrl?.replace(/\/+$/, '') || '/wasm';
    let wasmBaseUrl: string;
    if (rawBase.startsWith('http://') || rawBase.startsWith('https://')) {
      wasmBaseUrl = rawBase;
    } else if (typeof window !== 'undefined' && window.location) {
      wasmBaseUrl = new URL(rawBase, window.location.origin).href.replace(/\/+$/, '');
    } else {
      wasmBaseUrl = rawBase;
    }
    const wasmJsUrl = `${wasmBaseUrl}/stream_asr.js`;

    // Composite cache key incorporating version and model source
    let cacheKey = this.options.modelVersion ? `v${this.options.modelVersion}` : 'v1.0.0';
    if (this.options.chunks && this.options.chunks.length > 0) {
      cacheKey += `#chunks:${this.options.chunks.join(',')}`;
    } else {
      cacheKey += `#${resolvedModelUrl}`;
    }

    // 2. Fetch or load cached model from IndexedDB
    let modelBuffer: ArrayBuffer | null = null;
    if (this.options.enableCache) {
      try {
        modelBuffer = await getCachedModel(cacheKey);
      } catch (err) {
        console.warn('[StreamRecognizer] IDB cache read error:', err);
      }
    }

    if (!modelBuffer) {
      const isChunkManifest = resolvedModelUrl.endsWith('.json');
      const hasExplicitChunks = Array.isArray(this.options.chunks) && this.options.chunks.length > 0;

      if (isChunkManifest || hasExplicitChunks) {
        // --- Multi-Chunk Parallel Streaming Download ---
        let chunkUrls: string[] = [];
        let expectedTotalSize = 0;

        if (hasExplicitChunks) {
          chunkUrls = this.options.chunks!.map(u => {
            if (typeof window !== 'undefined' && window.location && !u.startsWith('http://') && !u.startsWith('https://')) {
              return new URL(u, window.location.origin).href;
            }
            return u;
          });
        } else {
          // Fetch chunk manifest JSON
          const mResp = await fetch(resolvedModelUrl);
          if (!mResp.ok) {
            throw new Error(`Failed to fetch model manifest from ${resolvedModelUrl}: ${mResp.statusText}`);
          }
          const manifest = await mResp.json();
          expectedTotalSize = manifest.totalSize || 0;
          const chunkEntries = manifest.chunks || [];
          chunkUrls = chunkEntries.map((c: any) => {
            const rawName = typeof c === 'string' ? c : c.name;
            return new URL(rawName, resolvedModelUrl).href;
          });
        }

        const chunkCount = chunkUrls.length;
        const chunkBuffers: Uint8Array[] = new Array(chunkCount);
        const loadedPerChunk: number[] = new Array(chunkCount).fill(0);
        let completedChunks = 0;

        const downloadChunk = async (url: string, index: number) => {
          const resp = await fetch(url);
          if (!resp.ok) {
            throw new Error(`Failed to download model chunk ${index} from ${url}: ${resp.statusText}`);
          }
          const contentLength = resp.headers.get('content-length');
          const chunkSize = contentLength ? parseInt(contentLength, 10) : 0;

          if (resp.body && chunkSize > 0) {
            const reader = resp.body.getReader();
            const parts: Uint8Array[] = [];
            let chunkLoaded = 0;

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) {
                parts.push(value);
                chunkLoaded += value.length;
                loadedPerChunk[index] = chunkLoaded;

                const sumLoaded = loadedPerChunk.reduce((a, b) => a + b, 0);
                const currentTotal = expectedTotalSize || sumLoaded;
                this.latestProgress = {
                  loaded: sumLoaded,
                  total: currentTotal,
                  percent: Math.min(100, Math.round((sumLoaded / currentTotal) * 100)),
                  completedChunks,
                  totalChunks: chunkCount
                };
                this.emit('download_progress', this.latestProgress);
              }
            }

            const chunkData = new Uint8Array(chunkLoaded);
            let offset = 0;
            for (const part of parts) {
              chunkData.set(part, offset);
              offset += part.length;
            }
            chunkBuffers[index] = chunkData;
          } else {
            const ab = await resp.arrayBuffer();
            chunkBuffers[index] = new Uint8Array(ab);
            loadedPerChunk[index] = ab.byteLength;
          }

          completedChunks++;
          const sumLoaded = loadedPerChunk.reduce((a, b) => a + b, 0);
          const currentTotal = expectedTotalSize || sumLoaded;
          this.latestProgress = {
            loaded: sumLoaded,
            total: currentTotal,
            percent: Math.min(100, Math.round((sumLoaded / currentTotal) * 100)),
            completedChunks,
            totalChunks: chunkCount
          };
          this.emit('download_progress', this.latestProgress);
        };

        // Parallel download all chunks
        await Promise.all(chunkUrls.map((url, i) => downloadChunk(url, i)));

        // Stitch all chunks in memory into a single continuous buffer
        const totalBytes = chunkBuffers.reduce((sum, c) => sum + c.length, 0);
        const combined = new Uint8Array(totalBytes);
        let stitchOffset = 0;
        for (const c of chunkBuffers) {
          combined.set(c, stitchOffset);
          stitchOffset += c.length;
        }
        modelBuffer = combined.buffer;
      } else {
        // --- Single File Streaming Download ---
        const resp = await fetch(resolvedModelUrl);
        if (!resp.ok) {
          throw new Error(`Failed to fetch model container from ${resolvedModelUrl}: ${resp.statusText}`);
        }

        const contentLength = resp.headers.get('content-length');
        const total = contentLength ? parseInt(contentLength, 10) : 0;

        if (resp.body && total > 0) {
          const reader = resp.body.getReader();
          const chunks: Uint8Array[] = [];
          let loaded = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(value);
              loaded += value.length;
              this.latestProgress = {
                loaded,
                total,
                percent: Math.min(100, Math.round((loaded / total) * 100))
              };
              this.emit('download_progress', this.latestProgress);
            }
          }

          const combined = new Uint8Array(loaded);
          let offset = 0;
          for (const chunk of chunks) {
            combined.set(chunk, offset);
            offset += chunk.length;
          }
          modelBuffer = combined.buffer;
        } else {
          modelBuffer = await resp.arrayBuffer();
        }
      }

      // Verify STT1 model magic integrity
      if (!isValidModelBuffer(modelBuffer)) {
        throw new Error('Downloaded model binary failed STT1 magic verification. File may be corrupted or truncated.');
      }

      // Cache complete stitched model into IndexedDB
      if (this.options.enableCache) {
        try {
          const cacheCopy = modelBuffer.slice(0);
          setCachedModel(cacheKey, cacheCopy).catch(err => {
            console.warn('[StreamRecognizer] Background model caching error:', err);
          });
        } catch (e) {
          console.warn('[StreamRecognizer] Could not clone buffer for caching:', e);
        }
      }
    }

    // 3. Spawn dedicated Web Worker safely
    const blob = new Blob([WORKER_SCRIPT], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    this.worker = new Worker(workerUrl);
    // Revoke object URL after a grace period to avoid browser race conditions on worker blob fetch
    setTimeout(() => {
      try { URL.revokeObjectURL(workerUrl); } catch (_) {}
    }, 2000);

    const numericMode: number = typeof this.options.mode === 'number'
      ? this.options.mode
      : this.options.mode === 'instant_stream' ? 1
      : this.options.mode === 'offline' ? 2
      : this.options.mode === 'universal_offline' ? 4 : 3;

    return new Promise((resolve, reject) => {
      if (!this.worker) return reject(new Error('Worker not created'));

      let initTimeout: any = null;

      const cleanupHandlers = () => {
        if (initTimeout) {
          clearTimeout(initTimeout);
          initTimeout = null;
        }
      };

      this.worker.onerror = (err) => {
        console.error('[StreamRecognizer] Worker runtime error:', err);
        cleanupHandlers();
        const error = new Error(err.message || 'ASR Web Worker runtime error');
        this.emit('error', error);
        if (!this.initialized) reject(error);
      };

      initTimeout = setTimeout(() => {
        if (!this.initialized) {
          cleanupHandlers();
          reject(new Error('ASR Engine initialization timed out after 30 seconds'));
        }
      }, 30000);

      this.worker.onmessage = (e) => {
        const { type, payload, error } = e.data;
        if (type === 'READY') {
          cleanupHandlers();
          this.initialized = true;
          this.emit('ready', undefined as unknown as void);
          resolve();
        } else if (type === 'ERROR') {
          cleanupHandlers();
          const err = new Error(error);
          this.emit('error', err);
          if (!this.initialized) reject(err);
        } else if (type === 'LOG') {
          this.emit('log', payload);
        } else if (type === 'RESULT') {
          const { text, vadState, isFinal, isRefined, tokenCount, inferenceMs } = payload;
          const vadCode = (vadState === 1 ? 1 : vadState === 2 ? 2 : 0) as VadStateCode;
          if (vadCode !== this.lastVadState) {
            this.lastVadState = vadCode;
            const stateName: VadStateName =
              vadCode === 1 ? 'SPEECH' : vadCode === 2 ? 'PAUSE' : 'SILENCE';
            this.emit('vad_state_change', { state: vadCode, stateName });
          }

          this.emit('recognizing', { text, vadState: vadCode, isFinal, isRefined });
          if (isFinal) {
            this.emit('recognized', { text, isFinal, isRefined, tokenCount, inferenceMs });
          }
          if (isRefined) {
            this.emit('refined', { text, isFinal, isRefined, tokenCount, inferenceMs });
          }
        }
      };

      this.worker.postMessage({
        type: 'INIT',
        payload: {
          wasmJsUrl,
          wasmBaseUrl,
          modelBuffer,
          config: {
            mode: numericMode,
            debug: this.options.debug ?? true,
            num_threads: this.options.numThreads ?? 1,
            audio: {
              sample_rate: this.options.sampleRate ?? 16000,
              chunk_size: 1600,
              pre_emphasis: 0.97
            },
            vad: {
              enabled: true,
              speech_prob_threshold: this.options.vadThreshold ?? 0.5,
              speech_pause_threshold: this.options.speechPauseThreshold ?? 0.925,
              min_speech_duration_ms: this.options.minSpeechDurationMs ?? 480,
              max_pause_duration_ms: this.options.maxPauseDurationMs ?? 2080,
              max_segment_duration_sec: this.options.maxSegmentDurationSec ?? 20
            },
            decoder: {
              max_token_num: this.options.maxTokenNum ?? 256,
              max_repeat_tokens: this.options.maxRepeatTokens ?? 15,
              placeholder_token_id: 64,
              eos_id: 2
            },
            enablePostSmooth: this.options.enablePostSmooth ?? true
          }
        }
      }, [modelBuffer]);
    });
  }

  /**
   * Feeds raw Float32 PCM audio samples to the streaming recognizer.
   *
   * If `inputSampleRate` differs from the engine target rate (16000Hz), the SDK
   * automatically performs real-time continuous phase resampling.
   *
   * @param inputPcm Float32Array containing audio samples in normalized range [-1.0, 1.0].
   * @param inputSampleRate Sample rate of the provided PCM audio (e.g. 16000, 44100, 48000). Default: 16000.
   * @param isFinal Set to true to signal the end of the current utterance.
   * @throws Error if called before `await recognizer.init()`.
   */
  public feed(inputPcm: Float32Array, inputSampleRate: number = 16000, isFinal: boolean = false): void {
    if (!this.worker || !this.initialized) {
      throw new Error('StreamRecognizer is not initialized yet. Call init() first.');
    }

    let pcm16k = inputPcm;
    if (inputSampleRate !== 16000) {
      if (!this.resampler) {
        this.resampler = new AudioResampler(inputSampleRate, 16000);
      }
      pcm16k = this.resampler.process(inputPcm);
    }

    this.worker.postMessage({
      type: 'FEED_AUDIO',
      payload: { samples: pcm16k, isFinal }
    });
  }

  /**
   * Flushes any remaining audio buffers and signals end-of-speech to finalize recognition.
   * Convenience equivalent to `feed(new Float32Array(0), 16000, true)`.
   */
  public finish(): void {
    this.feed(new Float32Array(0), 16000, true);
  }

  /**
   * Dynamically updates runtime parameters without reloading the model.
   * @param config Partial options to update (e.g. debug, vadThreshold, enablePostSmooth).
   */
  public setConfig(config: Partial<StreamRecognizerOptions>): void {
    if (this.worker && this.initialized) {
      this.worker.postMessage({
        type: 'CONFIG',
        payload: config
      });
    }
  }

  /**
   * Resets the recognition stream, clearing current VAD history, intermediate tokens,
   * and resampler state for a clean new utterance session without reloading models.
   */
  public reset(): void {
    if (this.worker) {
      this.worker.postMessage({ type: 'RESET' });
      this.lastVadState = -1;
    }
    if (this.resampler) {
      this.resampler.reset();
    }
  }

  /**
   * Gracefully releases all Web Worker resources, cleans up audio resamplers,
   * unbinds all event listeners, and frees WebAssembly memory.
   */
  public destroy(): void {
    if (this.worker) {
      this.worker.postMessage({ type: 'DESTROY' });
      setTimeout(() => {
        if (this.worker) {
          this.worker.terminate();
          this.worker = null;
        }
      }, 50);
    }
    if (this.resampler) {
      this.resampler.reset();
    }
    this.listeners.clear();
    this.initialized = false;
  }
}
