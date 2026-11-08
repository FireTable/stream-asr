/**
 * Speech recognition execution modes.
 * - `1` or `'instant_stream'`: Push-to-talk ultra-low latency single utterance.
 * - `2` or `'offline'`: Complete audio block recognition (non-streaming).
 * - `3` or `'universal_stream'`: Continuous streaming with autonomous neural VAD sentence segmentation (Default).
 * - `4` or `'universal_offline'`: Batch audio file with VAD auto-splitting.
 */
export type ASRMode = 1 | 2 | 3 | 4 | 'instant_stream' | 'offline' | 'universal_stream' | 'universal_offline';

/**
 * Voice activity detection numerical state code:
 * - `0`: SILENCE (background noise / no speech)
 * - `1`: SPEECH (active human voice detected)
 * - `2`: PAUSE (speech pause / sentence end boundary)
 */
export type VadStateCode = 0 | 1 | 2;

/**
 * Human-readable voice activity detection state name.
 */
export type VadStateName = 'SILENCE' | 'SPEECH' | 'PAUSE';

/**
 * Options for configuring the StreamRecognizer instance.
 */
export interface StreamRecognizerOptions {
  /**
   * URL or relative path to the packed model container file (`model.bin`)
   * OR to a chunked model manifest JSON (`model.json`).
   * Can be a local path (e.g. `'/model.bin'` or `'/model_chunks/model.json'`) or a CDN URL.
   * @default '/model.bin'
   */
  modelUrl?: string;

  /**
   * Optional model version tag used for IndexedDB cache invalidation (e.g. '1.0.0').
   * Changing this version automatically evicts old cached models and fetches the new one.
   * @default '1.0.0'
   */
  modelVersion?: string;

  /**
   * Explicit array of chunk URLs to download in parallel.
   * When provided, the SDK concurrently streams all chunks and reassembles them in memory.
   */
  chunks?: string[];

  /**
   * Path to the directory hosting `stream_asr.wasm` and `stream_asr.js`.
   * Can be a local directory (e.g. `'/wasm'`) or an absolute URL.
   * @default '/wasm'
   */
  wasmBaseUrl?: string;

  /**
   * Execution mode:
   * - `1` | `'instant_stream'`: Push-to-talk ultra-low latency
   * - `2` | `'offline'`: Complete audio block recognition
   * - `3` | `'universal_stream'`: Continuous streaming with neural VAD (Default)
   * - `4` | `'universal_offline'`: Batch audio file with VAD splitting
   * @default 3
   */
  mode?: ASRMode;

  /**
   * Target sample rate in Hz. PCM input at other sample rates will be
   * automatically resampled to this rate in real-time.
   * @default 16000
   */
  sampleRate?: number;

  /**
   * Maximum token generation limit per segment.
   * @default 256
   */
  maxTokenNum?: number;

  /**
   * Neural VAD speech probability activation threshold (0.0 to 1.0).
   * @default 0.5
   */
  vadThreshold?: number;

  /**
   * Ratio of silence frames in pause window required to finalize a sentence (0.1 ~ 0.99).
   * @default 0.925
   */
  speechPauseThreshold?: number;

  /**
   * Speech onset detection window in milliseconds.
   * @default 480
   */
  minSpeechDurationMs?: number;

  /**
   * Silence pause duration required to trigger sentence completion in milliseconds.
   * @default 2080
   */
  maxPauseDurationMs?: number;

  /**
   * Maximum continuous utterance duration before forcing sentence break (in seconds).
   * @default 20
   */
  maxSegmentDurationSec?: number;

  /**
   * Maximum consecutive identical tokens before breaking repetition loop.
   * @default 15
   */
  maxRepeatTokens?: number;

  /**
   * Number of MNN backend compute threads for WebAssembly SIMD inference.
   * @default 1
   */
  numThreads?: number;

  /**
   * Enable IndexedDB offline persistent caching for `model.bin`.
   * When enabled, subsequent visits launch instantly without downloading.
   * @default true
   */
  enableCache?: boolean;

  /**
   * Enable disfluency filtering and punctuation post-processing smoothing.
   * @default true
   */
  enablePostSmooth?: boolean;

  /**
   * Enable verbose debug logging to console and 'log' event listener.
   * @default true
   */
  debug?: boolean;
}

/**
 * Diagnostic log event emitted by the runtime or Web Worker.
 */
export interface LogEvent {
  timestamp: number;
  level: 'info' | 'debug' | 'warn' | 'error';
  tag: 'INIT' | 'AUDIO' | 'VAD' | 'STREAM' | 'SEGMENT' | 'TWOPASS';
  message: string;
  data?: unknown;
}

/**
 * Live interim transcription event emitted as speech is recognized in real-time.
 */
export interface RecognizingEvent {
  /**
   * Current cumulative or streaming transcript text.
   */
  text: string;

  /**
   * Voice activity state code: 0 = silence, 1 = speech, 2 = pause/finish.
   */
  vadState: VadStateCode;

  /**
   * Whether this marks the end of the current streaming utterance segment.
   */
  isFinal: boolean;

  /**
   * Whether this text has been smoothed by the second-pass refiner (if enabled).
   */
  isRefined?: boolean;
}

/**
 * Finalized segment event emitted when a complete sentence boundary is recognized.
 */
export interface RecognizedEvent {
  /**
   * Finalized transcript text for this sentence segment.
   */
  text: string;

  /**
   * Always true for finalized segments.
   */
  isFinal: boolean;

  /**
   * Whether this text has been smoothed by the second-pass refiner.
   */
  isRefined?: boolean;

  /**
   * Total token count generated for this segment.
   */
  tokenCount: number;

  /**
   * Total inference time consumed in milliseconds.
   */
  inferenceMs: number;
}

/**
 * Event emitted when the neural VAD detects a transition between silence, speech, or pause.
 */
export interface VadStateChangeEvent {
  /**
   * State code: 0 = silence, 1 = speech, 2 = pause/finish.
   */
  state: VadStateCode;

  /**
   * Human-readable state name: 'SILENCE' | 'SPEECH' | 'PAUSE'.
   */
  stateName: VadStateName;
}

/**
 * Progress event emitted during network download of the model container (single file or parallel chunks).
 */
export interface DownloadProgressEvent {
  /**
   * Bytes downloaded so far across all active chunks.
   */
  loaded: number;

  /**
   * Total bytes to download (from Content-Length header or chunk manifest).
   */
  total: number;

  /**
   * Download progress percentage from 0 to 100.
   */
  percent: number;

  /**
   * Number of chunks fully downloaded so far (for chunked downloads).
   */
  completedChunks?: number;

  /**
   * Total number of chunks (for chunked downloads).
   */
  totalChunks?: number;
}

/**
 * Complete type map of all events supported by StreamRecognizer.
 */
export type EventMap = {
  recognizing: RecognizingEvent;
  recognized: RecognizedEvent;
  refined: RecognizedEvent;
  vad_state_change: VadStateChangeEvent;
  download_progress: DownloadProgressEvent;
  log: LogEvent;
  ready: void;
  error: Error;
};

/**
 * Generic listener function type supporting both payload and void events.
 */
export type Listener<T> = T extends void | undefined ? () => void : (event: T) => void;
