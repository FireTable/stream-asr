import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Mic, Play, RefreshCw, Square, Terminal, X, ChevronDown, ArrowDown } from 'lucide-react';
import SoundLabOrb from './SoundLabOrb';
import { StreamRecognizer, type LogEvent } from '@firetable/stream-asr';
import { translations, getInitialLang, type Lang } from '../i18n/translations';

export interface SampleItem {
  id: string;
  title: string;
  tag: string;
  desc: string;
  url: string;
}

export const SAMPLES: SampleItem[] = [
  {
    id: 'leader',
    title: '领导废话实录',
    tag: '大厂画饼',
    desc: '拉齐认知颗粒度与寻找抓手的抓手',
    url: '/samples/sample_leader.wav'
  },
  {
    id: 'kfc',
    title: '疯狂星期四V我50算诈骗吗',
    tag: '星期四文学',
    desc: '虚构身世诱导转账与黄金脆皮鸡定性',
    url: '/samples/sample_kfc.wav'
  },
  {
    id: 'ai_coder',
    title: 'AI淘汰程序员事故复盘',
    tag: '赛博降本',
    desc: '大模型死循环互喷与自信清空数据库',
    url: '/samples/sample_ai_coder.wav'
  },
  {
    id: 'wolf',
    title: '红太狼打灰太狼算家暴吗',
    tag: '青青草原',
    desc: '平底锅重度钝击与原地复活法律定性',
    url: '/samples/sample_wolf.wav'
  },
  {
    id: 'ultraman',
    title: '奥特曼踩烂大楼谁来赔',
    tag: '硬核普法',
    desc: '市中心紧急避险与防卫队保单理赔',
    url: '/samples/sample_ultraman.wav'
  }
];

export default function SoundLabHeroOrb() {
  const [lang, setLang] = useState<Lang>(getInitialLang);
  const [isInitializing, setIsInitializing] = useState(false);
  const [displayProgress, setDisplayProgress] = useState(0); // 0 to 100%
  const [initPhase, setInitPhase] = useState<'preparing' | 'downloading' | 'initializing' | 'cached_loading'>('preparing');
  const [downloadMB, setDownloadMB] = useState('0.0');
  const [isReady, setIsReady] = useState(false);

  const targetProgressRef = useRef(0);
  const currentProgressRef = useRef(0);
  const initPhaseRef = useRef<'preparing' | 'downloading' | 'initializing' | 'cached_loading'>('preparing');
  const downloadMBRef = useRef('0.0');
  const [isRecording, setIsRecording] = useState(false);
  const [isPlayingTest, setIsPlayingTest] = useState(false);
  const [currentSampleIndex, setCurrentSampleIndex] = useState(0);
  const [showSampleMenu, setShowSampleMenu] = useState(false);
  const [activeSample, setActiveSample] = useState<SampleItem | null>(null);
  const [transcript, setTranscript] = useState('');
  const [vadState, setVadState] = useState<'SILENCE' | 'SPEECH' | 'PAUSE'>('SILENCE');
  const [audioLevel, setAudioLevel] = useState(0);
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [stats, setStats] = useState({
    rtf: 0.46,
    tokenCount: 0,
    inferenceMs: 0,
    audioDuration: 0
  });
  const [activeThreads, setActiveThreads] = useState<number>(1);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const isUserScrolledUpRef = useRef(false);

  const recognizerRef = useRef<StreamRecognizer | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const testAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const testAudioCtxRef = useRef<AudioContext | null>(null);
  const isPlayingTestRef = useRef(false);
  const isRecordingRef = useRef(false);
  const isAbortedRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const sampleMenuRef = useRef<HTMLDivElement>(null);
  const orbWrapperRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);
  const initPromiseRef = useRef<Promise<void> | null>(null);

  // Close sample dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sampleMenuRef.current && !sampleMenuRef.current.contains(e.target as Node)) {
        setShowSampleMenu(false);
      }
    };
    if (showSampleMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSampleMenu]);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        left: scrollContainerRef.current.scrollWidth,
        behavior: 'smooth'
      });
    }
  }, [transcript]);

  // User scroll listener: detect if user scrolled up away from bottom
  const handleLogScroll = () => {
    const el = logContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isUp = distanceFromBottom > 35;
    isUserScrolledUpRef.current = isUp;
    setIsUserScrolledUp(isUp);
  };

  const scrollToBottom = (smooth = true) => {
    isUserScrolledUpRef.current = false;
    setIsUserScrolledUp(false);
    if (logContainerRef.current) {
      if (smooth) {
        logContainerRef.current.scrollTo({
          top: logContainerRef.current.scrollHeight,
          behavior: 'smooth'
        });
      } else {
        logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
      }
    }
  };

  // Auto-scroll when new logs arrive, ONLY IF user is not inspecting previous logs
  useEffect(() => {
    if (!showLogs || !logContainerRef.current) return;
    if (!isUserScrolledUpRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // When drawer opens, reset scrolled-up lock and scroll to bottom once
  useEffect(() => {
    if (showLogs) {
      isUserScrolledUpRef.current = false;
      setIsUserScrolledUp(false);
      requestAnimationFrame(() => {
        if (logContainerRef.current) {
          logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
      });
    }
  }, [showLogs]);

  // Isolate debug drawer scrolling: strictly prevent scroll chaining / penetration to background page
  useEffect(() => {
    if (!showLogs) return;
    const drawer = drawerRef.current;
    const logEl = logContainerRef.current;
    if (!drawer) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (logEl) {
        logEl.scrollTop += e.deltaY;
        handleLogScroll();
      }
    };

    let startY = 0;
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        startY = e.touches[0].clientY;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1 && logEl) {
        e.preventDefault();
        e.stopPropagation();
        const currentY = e.touches[0].clientY;
        const deltaY = startY - currentY;
        startY = currentY;
        logEl.scrollTop += deltaY;
        handleLogScroll();
      }
    };

    drawer.addEventListener('wheel', handleWheel, { passive: false });
    drawer.addEventListener('touchstart', handleTouchStart, { passive: true });
    drawer.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      drawer.removeEventListener('wheel', handleWheel);
      drawer.removeEventListener('touchstart', handleTouchStart);
      drawer.removeEventListener('touchmove', handleTouchMove);
    };
  }, [showLogs]);

  // Sync with global language switcher
  useEffect(() => {
    setLang(getInitialLang());

    const handleLang = (e: Event) => {
      const customEvent = e as CustomEvent<Lang>;
      if (customEvent.detail) setLang(customEvent.detail);
    };
    window.addEventListener('stream_asr_lang_change', handleLang);
    return () => window.removeEventListener('stream_asr_lang_change', handleLang);
  }, []);

  const currentTranslations = translations[lang] || translations['zh-cn'];
  const t = currentTranslations.hero;
  const tc = currentTranslations.console;

  const sampleItems: SampleItem[] = SAMPLES.map((s, idx) => {
    const localized = (t as any).samples?.[idx];
    return {
      ...s,
      title: localized?.title || s.title,
      tag: localized?.tag || s.tag,
      desc: localized?.desc || s.desc,
    };
  });

  const [isClientMounted, setIsClientMounted] = useState(false);
  useEffect(() => {
    setIsClientMounted(true);
  }, []);

  // Close console on Escape key
  useEffect(() => {
    if (!showLogs) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowLogs(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showLogs]);

  // Decoupled 60fps/120fps rAF loop for ultra-smooth liquid progress animation
  useEffect(() => {
    if (!isInitializing) {
      setDisplayProgress(0);
      currentProgressRef.current = 0;
      targetProgressRef.current = 0;
      return;
    }

    let rafId: number;
    let lastTextSync = 0;

    const tick = (now: number) => {
      const target = targetProgressRef.current;
      const current = currentProgressRef.current;
      const diff = target - current;

      // STRICT MONOTONIC PROGRESS GUARANTEE:
      // The progress bar can ONLY move forward (diff > 0). It MUST NEVER rewind (diff < 0).
      if (diff > 0.05) {
        currentProgressRef.current += diff * 0.14;
      } else if (diff > 0) {
        currentProgressRef.current = target;
      }
      // If diff <= 0, retain current progress, do not decrement.

      setDisplayProgress(currentProgressRef.current);

      if (now - lastTextSync > 50) {
        lastTextSync = now;
        setInitPhase(initPhaseRef.current);
        setDownloadMB(downloadMBRef.current);
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isInitializing]);

  // Clean unmount lifecycle & idle engine pre-initialization
  useEffect(() => {
    isMountedRef.current = true;

    // Probe environment for expected multi-worker concurrency
    if (typeof window !== 'undefined' && StreamRecognizer.isMultiWorkerSupported()) {
      const hwCores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
      const expectedThreads = Math.min(4, Math.max(1, hwCores >= 4 ? 4 : 2));
      setActiveThreads(expectedThreads);
    }

    // Trigger engine initialization on browser idle to provide zero-wait instant speech
    let idleTimer: any = null;
    const triggerIdleInit = () => {
      if (!isMountedRef.current) return;
      if (!isReady && !recognizerRef.current && !initPromiseRef.current) {
        initEngine();
      }
    };

    if (typeof window !== 'undefined') {
      if ('requestIdleCallback' in window) {
        idleTimer = (window as any).requestIdleCallback(triggerIdleInit, { timeout: 2500 });
      } else {
        idleTimer = setTimeout(triggerIdleInit, 1200);
      }
    }

    return () => {
      isMountedRef.current = false;
      if (typeof window !== 'undefined') {
        if ('cancelIdleCallback' in window && idleTimer) {
          (window as any).cancelIdleCallback(idleTimer);
        } else if (idleTimer) {
          clearTimeout(idleTimer);
        }
      }
      stopRecording();
      stopTestAudio();
      recognizerRef.current?.destroy();
      recognizerRef.current = null;
    };
  }, []);

  // Initialize engine strictly in Mode 3 (Universal Stream with VAD)
  const initEngine = async () => {
    if (isReady && recognizerRef.current) return;
    if (initPromiseRef.current) {
      await initPromiseRef.current;
      return;
    }

    setIsInitializing(true);
    const isCached = typeof window !== 'undefined' && localStorage.getItem('stream_asr_cached') === 'true';

    // Initial phase: if cached, show cached loading; if not, show preparing (NEVER '0.0 MB')
    initPhaseRef.current = isCached ? 'cached_loading' : 'preparing';
    setInitPhase(initPhaseRef.current);
    targetProgressRef.current = isCached ? 20 : 6;
    downloadMBRef.current = '0.0';

    let idbProgressTimer: any = null;
    let prepTimer: any = null;
    let hasDownloaded = false;

    // Gentle preparation crawl (6% -> 12%) so user feels responsiveness while worker & manifest load
    if (!isCached) {
      prepTimer = setInterval(() => {
        if (!hasDownloaded && targetProgressRef.current < 12) {
          targetProgressRef.current = Math.min(12, targetProgressRef.current + 0.6);
        }
      }, 150);
    } else {
      // When reading from IDB cache without network download, advance progress smoothly to 90%
      idbProgressTimer = setInterval(() => {
        if (!hasDownloaded && targetProgressRef.current < 90) {
          targetProgressRef.current = Math.min(90, targetProgressRef.current + 12);
        }
      }, 70);
    }

    initPromiseRef.current = (async () => {
      try {
        const recognizer = new StreamRecognizer({
          modelUrl: (import.meta.env.PUBLIC_MODEL_URL as string) || '/model_chunks/model.json',
          wasmBaseUrl: '/wasm',
          mode: 3, // Strict Mode 3: Universal Streaming with Neural VAD
          numThreads: 'auto',
          vadThreshold: 0.5,
          enableCache: true
        });

        recognizer.on('ready', (readyEvt) => {
          if (readyEvt && typeof readyEvt.threads === 'number') {
            setActiveThreads(readyEvt.threads);
          }
        });

        recognizer.on('recognizing', ({ text }) => {
          if (text) {
            setTranscript(text);
          }
        });

        recognizer.on('recognized', ({ text, tokenCount, inferenceMs }) => {
          if (text) {
            setTranscript(text);
          }
          setStats(prev => ({ ...prev, tokenCount, inferenceMs }));
        });

        recognizer.on('vad_state_change', ({ stateName }) => {
          setVadState(stateName);
        });

        recognizer.on('log', (logEvt) => {
          setLogs(prev => [...prev.slice(-99), logEvt]);
        });

        recognizer.on('download_progress', ({ percent, loaded, total }) => {
          if (isAbortedRef.current || !isMountedRef.current) return;
          hasDownloaded = true;
          if (idbProgressTimer) {
            clearInterval(idbProgressTimer);
            idbProgressTimer = null;
          }
          if (prepTimer) {
            clearInterval(prepTimer);
            prepTimer = null;
          }

          // Switch to 'downloading' immediately starting from 0.0 MB in real-time
          initPhaseRef.current = 'downloading';
          downloadMBRef.current = (loaded / (1024 * 1024)).toFixed(1);

          // Download maps 0% ~ 100% of network data to 12% ~ 90% of button progress
          const downloadTarget = Math.min(90, Math.round(12 + (percent / 100) * 78));
          targetProgressRef.current = Math.max(targetProgressRef.current, downloadTarget);
        });

        recognizer.on('error', (err) => {
          console.error('[StreamRecognizer Error]:', err);
        });

        await recognizer.init();
        if (typeof recognizer.threads === 'number') {
          setActiveThreads(recognizer.threads);
        }

        if (idbProgressTimer) {
          clearInterval(idbProgressTimer);
          idbProgressTimer = null;
        }
        if (prepTimer) {
          clearInterval(prepTimer);
          prepTimer = null;
        }

        if (!isMountedRef.current) {
          recognizer.destroy();
          return;
        }

        // Cache flag for instant recognition in subsequent sessions
        if (typeof window !== 'undefined') {
          try { localStorage.setItem('stream_asr_cached', 'true'); } catch {}
        }

        // Smooth transition to WASM/runtime initialization
        initPhaseRef.current = 'initializing';
        targetProgressRef.current = 100;

        // Brief 250ms completion hold so user sees smooth completion glint
        await new Promise(res => setTimeout(res, 250));

        recognizerRef.current = recognizer;
        setIsReady(true);
      } catch (err: any) {
        console.error('Failed to init engine:', err);
      } finally {
        if (idbProgressTimer) clearInterval(idbProgressTimer);
        if (prepTimer) clearInterval(prepTimer);
        if (isMountedRef.current) {
          setIsInitializing(false);
        }
        initPromiseRef.current = null;
      }
    })();

    await initPromiseRef.current;
  };

  const toggleRecording = async () => {
    if (isRecording || isRecordingRef.current) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const startRecording = async () => {
    try {
      stopTestAudio();
      isAbortedRef.current = false;
      isRecordingRef.current = true;
      setIsRecording(true);
      setTranscript('');

      if (!isReady || !recognizerRef.current) {
        await initEngine();
      }

      // If user clicked stop or unmounted while waiting for engine initialization
      if (isAbortedRef.current || !isRecordingRef.current) {
        return;
      }

      if (recognizerRef.current) {
        recognizerRef.current.reset();
      }

      // 1. Request user microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // If user stopped while getUserMedia prompt was pending, tear down immediately
      if (isAbortedRef.current || !isRecordingRef.current) {
        stream.getTracks().forEach(t => {
          t.enabled = false;
          t.stop();
        });
        return;
      }

      mediaStreamRef.current = stream;

      // 2. Create native AudioContext (prefer 16kHz for native browser resampling, fallback to hardware rate)
      let audioCtx: AudioContext;
      try {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      } catch {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      audioContextRef.current = audioCtx;

      // 3. Explicitly resume AudioContext to satisfy browser autoplay policies
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      const source = audioCtx.createMediaStreamSource(stream);
      audioSourceRef.current = source;

      // Use 2048 buffer size (~42ms @ 48kHz) for ultra-low latency streaming without audio dropouts
      const processor = audioCtx.createScriptProcessor(2048, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (!isRecordingRef.current) return;
        const raw = e.inputBuffer.getChannelData(0);

        // Mute outputBuffer to prevent speaker feedback loop
        const output = e.outputBuffer.getChannelData(0);
        output.fill(0);

        // Compute volume level (RMS) with human voice curve for dynamic visual feedback
        let sum = 0;
        for (let i = 0; i < raw.length; i++) sum += raw[i] * raw[i];
        const rms = Math.sqrt(sum / raw.length);
        setAudioLevel(Math.min(1.0, rms * 15));

        // Feed to WASM Mode 3 recognizer
        if (recognizerRef.current && audioContextRef.current) {
          recognizerRef.current.feed(new Float32Array(raw), audioContextRef.current.sampleRate, false);
        }
      };

      source.connect(processor);
      // Directly connecting to destination ensures Web Audio engine keeps pulling frames reliably
      processor.connect(audioCtx.destination);
    } catch (err: any) {
      isRecordingRef.current = false;
      setIsRecording(false);
      console.error('Microphone access denied:', err);
      alert('Microphone access required: ' + (err.message || String(err)));
    }
  };

  const stopRecording = () => {
    if (!isRecordingRef.current && !isRecording) return;
    isRecordingRef.current = false;
    setIsRecording(false);
    setAudioLevel(0);

    // Finalize the recognizer to flush final pending tokens
    if (recognizerRef.current) {
      try {
        recognizerRef.current.finish();
      } catch {}
    }

    // 1. Detach audio callback and disconnect processor node from audio graph
    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      try {
        processorRef.current.disconnect();
      } catch {}
      processorRef.current = null;
    }

    // 2. Disconnect microphone media stream audio source node
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.disconnect();
      } catch {}
      audioSourceRef.current = null;
    }

    // 3. Explicitly stop and disable all microphone tracks to release hardware mic
    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach(t => {
          t.enabled = false;
          t.stop();
        });
      } catch {}
      mediaStreamRef.current = null;
    }

    // 4. Close audio context to tear down the OS audio input session
    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close().catch(() => {});
        }
      } catch {}
      audioContextRef.current = null;
    }

    // Retain transcript so user can see their finalized recognized sentence!
  };

  const stopTestAudio = () => {
    isAbortedRef.current = true;
    isPlayingTestRef.current = false;
    if (testAudioSourceRef.current) {
      try {
        testAudioSourceRef.current.stop();
        testAudioSourceRef.current.disconnect();
      } catch {}
      testAudioSourceRef.current = null;
    }
    if (testAudioCtxRef.current) {
      try {
        testAudioCtxRef.current.close();
      } catch {}
      testAudioCtxRef.current = null;
    }
    if (recognizerRef.current) {
      recognizerRef.current.reset();
    }
    setIsPlayingTest(false);
    setAudioLevel(0);
    setTranscript('');
  };

  const runTestAudio = async (chosenIndex?: number) => {
    if (!isReady || !recognizerRef.current) {
      await initEngine();
    }
    if (isPlayingTest) {
      stopTestAudio();
      return;
    }
    stopRecording();
    stopTestAudio();
    isAbortedRef.current = false;

    const targetIdx = typeof chosenIndex === 'number' ? chosenIndex : currentSampleIndex;
    const sample = sampleItems[targetIdx] || SAMPLES[targetIdx];
    setActiveSample(sample);
    // Cycle sequentially for next playback
    setCurrentSampleIndex((targetIdx + 1) % sampleItems.length);

    setIsPlayingTest(true);
    isPlayingTestRef.current = true;
    setTranscript('');

    try {
      const resp = await fetch(sample.url);
      const arrayBuf = await resp.arrayBuffer();

      // Create native AudioContext for synchronized speaker audio playback
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      testAudioCtxRef.current = audioCtx;

      // Decode audio for both playback and recognition
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuf.slice(0));
      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioCtx.destination);
      testAudioSourceRef.current = source;

      // Start audio playback out loud through speakers
      source.start(0);

      const channelData = audioBuffer.getChannelData(0);
      const sampleRate = audioBuffer.sampleRate;

      if (recognizerRef.current) {
        recognizerRef.current.reset();
        const t0 = performance.now();

        // Feed chunks at 200ms intervals synchronized with playback
        const chunkSamples = Math.floor(sampleRate * 0.2); // ~200ms chunk
        for (let off = 0; off < channelData.length; off += chunkSamples) {
          if (!isPlayingTestRef.current || isAbortedRef.current) break;
          const chunk = channelData.subarray(off, Math.min(channelData.length, off + chunkSamples));
          const isFinal = off + chunk.length >= channelData.length;
          recognizerRef.current.feed(chunk, sampleRate, isFinal);

          // Compute real-time RMS from audio to drive the Living SoundLabOrb fluid wave!
          let sum = 0;
          for (let i = 0; i < chunk.length; i++) sum += chunk[i] * chunk[i];
          const rms = Math.sqrt(sum / chunk.length);
          setAudioLevel(Math.min(1.0, rms * 4));

          if (isFinal) {
            // Wait for WASM worker to finish processing the final chunk before completing
            await new Promise<void>((resolve) => {
              const timer = setTimeout(resolve, 2500);
              const handler = () => {
                clearTimeout(timer);
                recognizerRef.current?.off('recognized', handler);
                resolve();
              };
              recognizerRef.current?.on('recognized', handler);
            });
            break;
          }

          await new Promise(r => setTimeout(r, 200));
        }

        if (isPlayingTestRef.current && !isAbortedRef.current) {
          const wall = performance.now() - t0;
          const dur = channelData.length / sampleRate;
          setStats(prev => ({
            ...prev,
            rtf: wall / (dur * 1000),
            audioDuration: dur
          }));
        }
      }
    } catch (err: any) {
      console.error('Failed to run test audio:', err);
    } finally {
      if (isPlayingTestRef.current) {
        setIsPlayingTest(false);
        isPlayingTestRef.current = false;
        setAudioLevel(0);
      }
    }
  };

  const clearTranscript = () => {
    stopTestAudio();
    setTranscript('');
    if (recognizerRef.current) {
      recognizerRef.current.reset();
    }
  };

  return (
    <div className="w-full flex flex-col items-center justify-center relative select-none">
      {/* Background Living Dynamic Resonance Aura */}
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none transition-all duration-700 ease-out ${
        isRecording || isPlayingTest
          ? 'w-[300px] h-[300px] sm:w-[540px] sm:h-[540px] bg-sky-400/20 blur-[80px] sm:blur-[150px]'
          : 'w-[200px] h-[200px] sm:w-[380px] sm:h-[380px] bg-sky-400/10 blur-[60px] sm:blur-[120px]'
      }`} />

      {/* Living Monumental Hero Orb: Click to Toggle Recording Directly */}
      <div
        ref={orbWrapperRef}
        className="relative group cursor-pointer transition-transform duration-500 ease-out hover:scale-[1.015] active:scale-[0.985]"
        onClick={toggleRecording}
        title={isRecording ? (t.stopSpeaking || '结束说话') : (t.startSpeaking || '点击说话')}
      >
        <SoundLabOrb
          isActive={isRecording || isPlayingTest}
          audioLevel={audioLevel}
        />
      </div>

      {/* =========================================================
          CINEMATIC STREAMING TRANSCRIPTION DIRECTLY UNDER THE BALL
          Single-Line Cinema Subtitle with Fade-in Motion & Zero CLS
          ========================================================= */}
      <div className="w-full max-w-4xl px-4 mt-1 sm:mt-2 flex flex-col items-center">
        {/* Relative Subtitle Frame with 100% Height-Uniform Horizontal Feathering */}
        <div className="relative w-full max-w-2xl sm:max-w-3xl flex items-center justify-center">
          {/* Single-Line Subtitle Container with Stable Reserved Height & Full-Height Linear Horizontal Mask */}
          <div 
            ref={scrollContainerRef}
            className="w-full h-10 sm:h-12 overflow-x-auto no-scrollbar scroll-smooth flex items-center px-8 sm:px-14 [mask-image:linear-gradient(to_right,transparent_0%,black_48px,black_calc(100%-48px),transparent_100%)] [-webkit-mask-image:linear-gradient(to_right,transparent_0%,black_48px,black_calc(100%-48px),transparent_100%)]"
          >
            <div className="min-w-full flex items-center justify-center py-1">
              {transcript ? (
                <div className="whitespace-nowrap text-lg sm:text-2xl md:text-3xl font-light text-zinc-900 dark:text-zinc-100 tracking-normal drop-shadow-sm dark:drop-shadow-md select-text flex items-center leading-normal">
                  {/* Leading Whitespace Spacer */}
                  <span aria-hidden="true" className="inline-block w-4 shrink-0 whitespace-pre">&nbsp;</span>
                  {transcript.split('').map((char, index) => (
                    <span
                      key={index}
                      className="inline-block animate-cinematic-char whitespace-pre"
                    >
                      {char === ' ' ? '\u00A0' : char}
                    </span>
                  ))}
                  {/* Trailing Whitespace Spacer */}
                  <span aria-hidden="true" className="inline-block w-4 shrink-0 whitespace-pre">&nbsp;</span>
                </div>
              ) : isRecording ? (
                <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 font-light tracking-wide whitespace-nowrap text-center select-none leading-normal">
                  {t.listeningPrompt || '正在聆听，请对着麦克风说话...'}
                </p>
              ) : isPlayingTest ? (
                <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 font-light tracking-wide whitespace-nowrap text-center select-none leading-normal">
                  {t.orbPlaying || '正在流式转写...'}
                </p>
              ) : (
                <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 font-light tracking-wide whitespace-nowrap text-center select-none leading-normal">
                  {t.idlePlaceholder || '点击下方麦克风，体验纯端侧实时语音转写'}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Control Buttons: Strict Fixed Height Container (Eliminates all CLS & Page Shifting) */}
        <div 
          className="w-full max-w-[270px] sm:max-w-[300px] h-[88px] sm:h-[96px] flex flex-col items-stretch justify-center gap-1.5 sm:gap-2 mt-1 sm:mt-2 mx-auto"
        >
          {/* Top Button: Start/Stop Speech Recording */}
          {isRecording ? (
            <div className="relative w-full h-10 sm:h-11 p-[1px] overflow-hidden rounded-full bg-zinc-200/80 dark:bg-white/15 shadow-[0_0_24px_-4px_rgba(56,189,248,0.35)] active:scale-[0.98] transition-transform duration-150">
              {/* React Bits Rotating Border Beam */}
              <span
                aria-hidden="true"
                className="absolute inset-[-1000%] animate-border-beam bg-[conic-gradient(from_0deg,transparent_0_320deg,rgba(56,189,248,0.4)_340deg,rgba(56,189,248,0.95)_355deg,rgba(255,255,255,0.95)_360deg)] pointer-events-none"
              />

              {/* Inner Button: Sleek Frosted Glass (Zero Accent Color Clutter) */}
              <button
                onClick={stopRecording}
                className="relative z-10 w-full h-full inline-flex items-center justify-center gap-2 px-6 rounded-full text-xs sm:text-sm font-medium bg-zinc-50/95 hover:bg-white text-zinc-900 dark:bg-[#0c0d12]/95 dark:hover:bg-[#14151a] dark:text-zinc-100 backdrop-blur-xl transition-colors whitespace-nowrap shadow-sm select-none"
              >
                <Square className="w-3 h-3 fill-current opacity-85 text-zinc-800 dark:text-zinc-200 shrink-0" />
                <span className="whitespace-nowrap font-medium tracking-wide">{t.stopSpeaking || '结束说话'}</span>
              </button>
            </div>
          ) : isPlayingTest ? (
            <button
              disabled
              className="w-full h-10 sm:h-11 inline-flex items-center justify-center gap-2 px-6 rounded-full text-xs sm:text-sm font-medium text-zinc-400 dark:text-zinc-600 bg-zinc-900/[0.03] dark:bg-white/[0.03] border border-zinc-900/5 dark:border-white/[0.04] opacity-40 cursor-not-allowed whitespace-nowrap"
            >
              <Mic className="w-4 h-4 text-current" />
              <span className="whitespace-nowrap">{t.startSpeaking || '点击说话'}</span>
            </button>
          ) : (
            <button
              onClick={toggleRecording}
              disabled={isInitializing}
              className="w-full h-10 sm:h-11 group relative overflow-hidden inline-flex items-center justify-center gap-2 px-6 rounded-full text-xs sm:text-sm font-medium transition-all duration-200 active:scale-[0.98] select-none shadow-sm text-zinc-800 hover:text-zinc-950 bg-zinc-900/[0.06] hover:bg-zinc-900/[0.10] border border-zinc-900/10 hover:border-zinc-900/20 dark:text-zinc-200 dark:hover:text-white dark:bg-white/[0.06] dark:hover:bg-white/[0.10] dark:border-white/[0.08] dark:hover:border-white/[0.16]"
            >
              {isInitializing ? (
                <>
                  {/* Simple Neutral Progress Fill (Zero theme color, pure neutral glass tint) */}
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 origin-left pointer-events-none rounded-full bg-zinc-900/[0.08] dark:bg-white/[0.12]"
                    style={{
                      transform: `scaleX(${Math.max(0.02, Math.min(1, displayProgress / 100))})`,
                      transition: 'transform 80ms cubic-bezier(0.2, 0.8, 0.4, 1)'
                    }}
                  />

                  {/* Neutral Label & Spinner (Consistent with standard button styling) */}
                  <div className="relative z-10 inline-flex items-center justify-center gap-2 text-zinc-800 dark:text-zinc-200 font-medium">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-zinc-500 dark:text-zinc-400 shrink-0" />
                    <span className="font-mono text-[11px] sm:text-xs tracking-tight whitespace-nowrap">
                      {initPhase === 'downloading'
                        ? `${t.orbDownloading || '下载模型'} ${downloadMB} MB`
                        : initPhase === 'cached_loading'
                          ? (t.orbLoadingCache || '正在加载本地模型...')
                          : initPhase === 'preparing'
                            ? (t.orbPreparing || '正在准备模型...')
                            : (t.orbInitializing || '正在初始化引擎...')}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4 text-current" />
                  <span className="whitespace-nowrap">{t.startSpeaking || '点击说话'}</span>
                </>
              )}
            </button>
          )}

          {/* Bottom Button: Sample Audio Playback or Stop Playback */}
          {isPlayingTest ? (
            <div className="relative w-full h-10 sm:h-11 p-[1px] overflow-hidden rounded-full bg-zinc-200/80 dark:bg-white/15 shadow-[0_0_24px_-4px_rgba(56,189,248,0.35)] active:scale-[0.98] transition-transform duration-150">
              {/* React Bits Rotating Border Beam */}
              <span
                aria-hidden="true"
                className="absolute inset-[-1000%] animate-border-beam bg-[conic-gradient(from_0deg,transparent_0_320deg,rgba(56,189,248,0.4)_340deg,rgba(56,189,248,0.95)_355deg,rgba(255,255,255,0.95)_360deg)] pointer-events-none"
              />

              {/* Inner Button: Sleek Frosted Glass (Zero Accent Color Clutter) */}
              <button
                onClick={() => {
                  stopTestAudio();
                  setTranscript('');
                }}
                className="relative z-10 w-full h-full inline-flex items-center justify-center gap-2 px-6 rounded-full text-xs sm:text-sm font-medium bg-zinc-50/95 hover:bg-white text-zinc-900 dark:bg-[#0c0d12]/95 dark:hover:bg-[#14151a] dark:text-zinc-100 backdrop-blur-xl transition-colors whitespace-nowrap shadow-sm select-none"
              >
                <Square className="w-3 h-3 fill-current opacity-85 text-zinc-800 dark:text-zinc-200 shrink-0" />
                <span className="whitespace-nowrap font-medium tracking-wide">{t.stopPlayback || '停止播放'}</span>
              </button>
            </div>
          ) : isRecording ? (
            <div className="relative w-full h-10 sm:h-11 flex items-center justify-center rounded-full bg-zinc-900/[0.03] dark:bg-white/[0.03] border border-zinc-900/5 dark:border-white/[0.04] opacity-40 cursor-not-allowed">
              <span className="inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-zinc-400 dark:text-zinc-600">
                <Play className="w-3.5 h-3.5 text-current fill-current opacity-30" />
                <span>{t.testAudio || '试听样本'}</span>
              </span>
            </div>
          ) : (
            <div 
              ref={sampleMenuRef} 
              className="relative w-full h-10 sm:h-11 flex items-center justify-center rounded-full bg-zinc-900/[0.04] hover:bg-zinc-900/[0.08] border border-zinc-900/10 hover:border-zinc-900/20 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] dark:border-white/[0.08] dark:hover:border-white/[0.16] transition-all duration-200 shadow-sm"
            >
              <button
                onClick={() => runTestAudio()}
                disabled={isInitializing}
                className="w-full h-full inline-flex items-center justify-center gap-2 px-6 text-xs sm:text-sm font-medium text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white transition-colors disabled:opacity-40 whitespace-nowrap"
                title={t.testAudioHint || "点击按顺序试听样本"}
              >
                <Play className="w-3.5 h-3.5 text-zinc-700 fill-zinc-700/20 dark:text-zinc-300 dark:fill-zinc-300/30" />
                <span className="whitespace-nowrap">{t.testAudio || '试听样本'}</span>
              </button>

              {/* Right-pinned Dropdown trigger & divider */}
              <div className="absolute right-0 top-0 bottom-0 flex items-center pr-2">
                <div className="w-[1px] h-3.5 bg-zinc-900/10 dark:bg-white/10 shrink-0" />
                <button
                  onClick={() => setShowSampleMenu(prev => !prev)}
                  disabled={isInitializing}
                  className="h-full px-2.5 inline-flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors disabled:opacity-40"
                  title={t.selectSampleHint || "选择样本 (3 选 1)"}
                  aria-label={t.selectSampleAria || "选择样本"}
                >
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showSampleMenu ? 'rotate-180 text-zinc-900 dark:text-white' : ''}`} />
                </button>
              </div>

              {/* Dropdown Menu for Direct N-Pick-1 Selection */}
              {showSampleMenu && (
                <div className="absolute bottom-full mb-2.5 left-1/2 -translate-x-1/2 w-[340px] sm:w-[380px] max-w-[calc(100vw-32px)] rounded-2xl bg-white/95 dark:bg-zinc-950/95 border border-zinc-200 dark:border-white/10 backdrop-blur-2xl shadow-2xl p-1.5 z-50 text-left font-sans animate-in fade-in-0 zoom-in-95">
                  <div className="px-3 py-1.5 text-[10px] font-mono text-zinc-400 dark:text-zinc-500 uppercase tracking-wider select-none">
                    {t.sampleMenuTitle || "选择试听原声样本 (30s)"}
                  </div>
                  {sampleItems.map((s, idx) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setShowSampleMenu(false);
                        runTestAudio(idx);
                      }}
                      className={`w-full flex flex-col items-start px-3 py-2 rounded-xl text-xs transition-colors ${
                        idx === currentSampleIndex
                          ? 'bg-zinc-100 text-zinc-900 border border-zinc-200 dark:bg-white/[0.08] dark:text-white dark:border-white/10'
                          : 'text-zinc-600 hover:bg-zinc-100/70 dark:text-zinc-300 dark:hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <div className="w-full flex items-center justify-between gap-2 min-w-0">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 font-medium shrink-0 tabular-nums">0{idx + 1}</span>
                          <span className="text-zinc-800 dark:text-zinc-200 font-medium truncate text-left">{s.title}</span>
                        </div>
                        {idx === currentSampleIndex && (
                          <span className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0" />
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5 truncate w-full text-left pl-[22px]">
                        {s.desc}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* =========================================================
          PURE CSS STICKY RUNTIME DEBUG HUD & CONSOLE DRAWER
          Rendered via React Portal into #console-sticky-dock at bottom of <main>
          ========================================================= */}
      {isClientMounted && typeof document !== 'undefined' && document.getElementById('console-sticky-dock') && createPortal(
        <div className="relative pointer-events-auto flex flex-col items-end">
          {/* Floating Terminal Drawer */}
          {showLogs && (
            <div 
              ref={drawerRef}
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-[calc(100%+12px)] right-0 z-50 w-[92vw] sm:w-[500px] max-h-[440px] sm:max-h-[480px] flex flex-col rounded-2xl overflow-hidden font-mono text-xs select-none overscroll-contain transition-all duration-200 [backdrop-filter:blur(24px)_saturate(180%)] [-webkit-backdrop-filter:blur(24px)_saturate(180%)] bg-white/95 dark:bg-zinc-950/95 text-zinc-900 dark:text-zinc-100 border border-zinc-200/90 dark:border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.06)] dark:shadow-[0_25px_60px_rgba(0,0,0,0.6),0_1px_1px_rgba(255,255,255,0.06)]"
            >
              {/* Drawer Header: Clean, balanced, lightweight bar */}
              <div className="relative z-20 flex items-center justify-between px-4 py-2.5 sm:px-5 sm:py-3 border-b border-zinc-200/80 dark:border-white/[0.08] bg-zinc-50/70 dark:bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 shrink-0" />
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200 text-xs tracking-tight">
                    {tc.title}
                  </span>
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-normal">
                    ({logs.length})
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      setLogs([]);
                      isUserScrolledUpRef.current = false;
                      setIsUserScrolledUp(false);
                    }}
                    className="text-[11px] px-2.5 py-1 rounded-md font-mono transition-colors text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-200/60 dark:hover:bg-white/10 active:scale-95"
                    title={tc.clear}
                  >
                    {tc.clear}
                  </button>
                  <button
                    onClick={() => setShowLogs(false)}
                    className="p-1 rounded-md transition-colors text-zinc-400 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-zinc-100 hover:bg-zinc-200/60 dark:hover:bg-white/10 active:scale-95"
                    aria-label="Close"
                    title="Close"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Log List (Self-contained scroll, isolated from background) */}
              <div 
                ref={logContainerRef}
                onScroll={handleLogScroll}
                className="relative z-10 flex-1 overflow-y-auto px-4 py-2.5 sm:px-5 sm:py-3 space-y-0 select-text font-mono text-[11px] leading-relaxed overscroll-contain debug-scrollbar"
              >
                {logs.length === 0 ? (
                  <div className="h-32 flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-500 text-center gap-1.5">
                    <p>{tc.emptyWaiting}</p>
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-600">{tc.emptyHint}</p>
                  </div>
                ) : (
                  logs.map((log, idx) => {
                    const timeStr = new Date(log.timestamp).toTimeString().split(' ')[0] + '.' + String(log.timestamp % 1000).padStart(3, '0');
                    const tagStyles: Record<string, string> = {
                      INIT: 'text-sky-700 bg-sky-500/10 border-sky-300/60 dark:text-sky-300 dark:bg-sky-500/15 dark:border-sky-400/30',
                      AUDIO: 'text-cyan-700 bg-cyan-500/10 border-cyan-300/60 dark:text-cyan-300 dark:bg-cyan-500/15 dark:border-cyan-400/30',
                      VAD: 'text-indigo-700 bg-indigo-500/10 border-indigo-300/60 dark:text-indigo-300 dark:bg-indigo-500/15 dark:border-indigo-400/30',
                      STREAM: 'text-emerald-700 bg-emerald-500/10 border-emerald-300/60 dark:text-emerald-300 dark:bg-emerald-500/15 dark:border-emerald-400/30',
                      SEGMENT: 'text-amber-700 bg-amber-500/10 border-amber-300/60 dark:text-amber-300 dark:bg-amber-500/15 dark:border-amber-400/30',
                      TWOPASS: 'text-purple-700 bg-purple-500/10 border-purple-300/60 dark:text-purple-300 dark:bg-purple-500/15 dark:border-purple-400/30',
                    };
                    const tagCls = tagStyles[log.tag] || 'text-zinc-700 bg-zinc-200/50 border-zinc-300/60 dark:text-zinc-300 dark:bg-white/[0.08] dark:border-white/15';
                    const isLast = idx === logs.length - 1;

                    return (
                      <div
                        key={idx}
                        className={`flex flex-col gap-1 py-2 leading-snug w-full text-left ${
                          isLast ? '' : 'border-b border-zinc-200/50 dark:border-white/[0.05]'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider border shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] ${tagCls}`}>
                            {log.tag}
                          </span>
                          <span className="text-zinc-400 dark:text-zinc-500 text-[10px] tabular-nums font-mono">
                            {timeStr}
                          </span>
                        </div>
                        <div className="text-zinc-800 dark:text-zinc-200 text-[11px] leading-relaxed break-words whitespace-pre-wrap font-mono text-left w-full pl-0.5">
                          {log.message}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={logEndRef} />
              </div>

              {/* Floating Jump to Bottom pill when user has scrolled up to inspect previous logs */}
              {isUserScrolledUp && (
                <button
                  onClick={() => scrollToBottom(true)}
                  className="absolute bottom-12 right-5 z-30 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-sans font-medium text-sky-600 dark:text-sky-300 bg-white/95 dark:bg-zinc-900/95 border border-sky-400/40 dark:border-sky-500/30 shadow-[0_4px_16px_rgba(0,0,0,0.12),0_2px_4px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.6)] backdrop-blur-md active:scale-95 transition-all duration-150 animate-in fade-in zoom-in-95 hover:bg-sky-50 dark:hover:bg-zinc-800 select-none cursor-pointer"
                  title={tc.jumpToBottom || '回到底部'}
                >
                  <ArrowDown className="w-3.5 h-3.5 animate-bounce" />
                  <span>{tc.jumpToBottom || '回到底部'}</span>
                </button>
              )}

              {/* Drawer Footer: Matching subtle bar */}
              <div className="relative z-20 px-4 py-2 sm:px-5 sm:py-2.5 border-t border-zinc-200/80 dark:border-white/[0.08] bg-zinc-50/70 dark:bg-white/[0.02] text-[10px] text-zinc-400 dark:text-zinc-500 flex items-center select-none">
                <span>
                  {activeThreads > 1 
                    ? `Worker 线程: ${activeThreads} (多 Worker 并行 · SIMD128)` 
                    : 'Worker 线程: 1 (单 Worker · SIMD128)'}
                </span>
              </div>
            </div>
          )}

          {/* Floating Toggle Button: Authentic Liquid Glass Capsule */}
          <button
            onClick={() => setShowLogs(prev => !prev)}
            className={`group flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-mono transition-all duration-200 select-none [backdrop-filter:blur(20px)_saturate(180%)] [-webkit-backdrop-filter:blur(20px)_saturate(180%)] ${
              showLogs
                ? 'bg-white/90 text-zinc-950 border-zinc-300/90 shadow-[0_4px_16px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,1)] dark:bg-zinc-900/80 dark:text-white dark:border-white/25 dark:shadow-[0_4px_20px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.18)]'
                : 'bg-white/65 hover:bg-white/85 text-zinc-700 hover:text-zinc-950 border-zinc-200/80 hover:border-zinc-300 shadow-[0_2px_12px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.9)] dark:bg-zinc-950/40 dark:hover:bg-zinc-900/60 dark:text-zinc-400 dark:hover:text-zinc-100 dark:border-white/[0.10] dark:hover:border-white/20 dark:shadow-[0_4px_16px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.12)]'
            } border active:scale-95`}
            title={tc.buttonTitle}
            aria-label={tc.button}
          >
            <Terminal className="w-3.5 h-3.5 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity" />
            <span className="font-medium tracking-tight">
              {tc.button}
            </span>
          </button>
        </div>,
        document.getElementById('console-sticky-dock')!
      )}
    </div>
  );
}
