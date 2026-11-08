<p align="center">
  <svg width="96" height="96" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="flame-grad-cn" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#38bdf8" />
        <stop offset="50%" stop-color="#0284c7" />
        <stop offset="100%" stop-color="#0369a1" />
      </linearGradient>
    </defs>
    <rect width="128" height="128" rx="28" fill="#08090a" stroke="#27272a" stroke-width="2" />
    <circle cx="64" cy="64" r="46" stroke="url(#flame-grad-cn)" stroke-width="2" stroke-dasharray="6 6" opacity="0.4" />
    <rect x="36" y="54" width="6" height="26" rx="3" fill="url(#flame-grad-cn)" opacity="0.65" />
    <rect x="48" y="42" width="6" height="46" rx="3" fill="url(#flame-grad-cn)" opacity="0.85" />
    <rect x="61" y="28" width="6" height="72" rx="3" fill="url(#flame-grad-cn)" />
    <rect x="74" y="38" width="6" height="52" rx="3" fill="url(#flame-grad-cn)" opacity="0.85" />
    <rect x="86" y="50" width="6" height="32" rx="3" fill="url(#flame-grad-cn)" opacity="0.65" />
  </svg>
</p>

<h1 align="center">Stream ASR</h1>

<p align="center">
  <b>基于 WebAssembly 与 SIMD128 的 100% 纯端侧低延迟流式语音识别运行时 · 零云端依赖 · 数据不出浏览器</b>
</p>

<p align="center">
  <a href="README.md">English</a> •
  <a href="README-CN.md"><b>简体中文</b></a>
</p>

<p align="center">
  <a href="https://asr.firetable.tech"><b>🌐 在线交互体验站 (Interactive Studio)</b></a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@firetable/stream-asr"><img src="https://img.shields.io/npm/v/@firetable/stream-asr?color=0284c7&logo=npm" alt="npm version" /></a>
  <a href="https://asr.firetable.tech"><img src="https://img.shields.io/badge/演示站-asr.firetable.tech-0284c7?logo=cloudflare&logoColor=white" alt="Live Demo" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache_2.0-blue.svg" alt="License" /></a>
  <img src="https://img.shields.io/badge/Wasm核心-2.2_MB-emerald?logo=webassembly&logoColor=white" alt="WASM Size" />
  <img src="https://img.shields.io/badge/实时比-0.45x-sky" alt="Real-Time Factor" />
  <img src="https://img.shields.io/badge/TypeScript-严格就绪-blue?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/零云端-100%25本地隐私-green" alt="Air-gapped" />
</p>

---

## 💡 项目概述

**Stream ASR** 是一套面向现代 Web 浏览器、Electron 以及桌面端应用的工业级纯端侧流式语音识别（ASR）运行时引擎与 SDK。

不同于传统方案必须将麦克风音频通过 WebSocket 或 gRPC 持续流式传输到远端云服务器，Stream ASR 将全链路声学前端处理（80 维 Kaldi FBank + CMVN）、40 层 INT8 因果 Transformer 声学推理、神经网络静音截断（Neural VAD）以及 64k 词级 Byte-Level BPE 文本解码**完整内嵌于浏览器沙箱独立的 Web Worker 线程**中执行。

遵循 **LiteASR 因果声学规范**构建，在单核普通 CPU 上即可达到低于 120ms 的流式首字上屏速度与 ~0.45x 的超低实时比（RTF），免去任何云端鉴权费用与网络抖动，彻底解决数据合规与隐私泄露风险。

---

## ⚡ 核心优势

- 🚀 **极速推理（单核 RTF ~0.45x）**：单 CPU 核心通过 Wasm SIMD128 向量化并发指令，处理 1 秒录音仅耗时约 0.45 秒。说话边说边出字，首字延迟低至 120ms。
- 🔒 **100% 隐私合规 · 物理无外发**：麦克风音频流全程在浏览器内存中闭环流转，不向外部发送任何音频数据包，满足企业级隐私合规要求。
- 📴 **IndexedDB 离线持久化秒开**：内置 IndexedDB 智能缓存。模型容器只下载一次，后续访问毫秒级瞬时唤醒，飞行模式断网照常使用。
- 🎙️ **工业级双模式执行**：
  - **模式 1（短句极速流式）**：专为语音输入框、快捷指令与智能搜索栏定制的 Push-to-talk 超低延迟模式；
  - **模式 3（通用长流式 + 神经 VAD）**：内置独立深度学习 VAD 状态机，智能探测换气与自然停顿，自动加标点与句子截断。
- 🌐 **中文（普通话）与英文高质量识别**：原生支持中文普通话与英文高准确率转写，内置 64k Byte BPE 词表与自适应动态加标点。
- 🔄 **内置无损音频重采样器**：支持任意硬件采样率（44.1kHz、48kHz 等）的 `Float32Array` PCM 音频输入，运行时无感毫秒级重采样至 16kHz。
- 🧩 **支持并发分片下载架构**：支持单一二进制包体（`model.bin`）或切片清单（`model.json` + `<=20MB` 分片），完美适配 Cloudflare Pages 等无服务器静态 CDN 限制。

---

## 📊 横向基准性能对比 (Benchmark)

在标准消费级桌面设备（Apple Silicon / 现代 x86_64 处理器单核，16kHz 单声道音频）实测：

| 方案 | 模型包体积 | 运行引擎 | 实时比 RTF (越低越快) | 首字延迟 | 100% 本地离线 | 云端网络抖动损耗 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **`@firetable/stream-asr`（本项目）** | **~175 MB** | **Wasm SIMD128 + MNN** | **~0.46x** | **< 120 ms** | **✅ 100% 支持** | **0 ms (无抖动)** |
| SenseVoice Small | ~230 MB | ONNX Runtime Web | ~0.75x | > 800 ms (整句等待) | ✅ 支持 | 0 ms |
| Whisper.cpp (base.en / int8) | ~140 MB | Wasm SIMD | ~0.85x | ~600 ms | ✅ 支持 | 0 ms |
| 商业云端语音识别 API | 云端服务器 | 云端多卡 GPU 集群 | ~0.30x | ~400 ms (网络传输) | ❌ 不支持 (音频出网) | 150ms ~ 600ms |

---

## 🤖 供 AI 编程助手（Cursor / Claude Code）接入指南

如果你正在使用 AI 编程助手（如 **Cursor**、**Claude Code**、**Windsurf** 或 **GitHub Copilot**），请直接复制以下提示词给 AI：

```markdown
请在当前项目中集成 @firetable/stream-asr 端侧流式语音识别：

1. 根据本项目包管理器（npm / pnpm / yarn / bun）安装 @firetable/stream-asr
2. 初始化 StreamRecognizer 实例（采用 Mode 3 通用流式模式，启用神经网络 VAD）
3. 接入麦克风音频流并监听 recognizing / recognized 实时文本回调

参考官方文档与示例：https://github.com/firetable/stream-asr#readme
```

### 机器可读文档直链
- **AI 快速索引摘要**：[`/llms.txt`](https://asr.firetable.tech/llms.txt)
- **完整深度技术参考**：[`/llms-full.txt`](https://asr.firetable.tech/llms-full.txt)

---

## 📂 项目仓库目录结构 (File Tree)

```
stream-asr/
├── packages/
│   ├── core/                        # C++17 / WASM 核心神经网络引擎
│   │   ├── build.sh                 # Emscripten 编译流水线 (SIMD128, O3 极致优化)
│   │   └── src/                     # 声学前端 (FBank, CMVN), VAD 状态机与 BPE 解码器
│   └── sdk/                         # 浏览器端 TypeScript SDK (@firetable/stream-asr)
│       ├── src/
│       │   ├── recognizer.ts        # 主 StreamRecognizer 控制器与公开 API
│       │   ├── worker.ts            # 隔离的 Web Worker 多线程管道
│       │   ├── resampler.ts         # 高精度线性音频重采样器 (任意采样率转 16kHz)
│       │   ├── idb-cache.ts         # IndexedDB 离线持久化缓存引擎
│       │   └── types.ts             # 完整 TypeScript 类型定义与 EventMap
│       ├── package.json
│       └── tsconfig.json
├── apps/
│   └── showcase/                    # 官方 Astro 5 + React 19 演示站点
│       ├── public/
│       │   ├── wasm/                # 编译生成的 stream_asr.wasm 与 stream_asr.js
│       │   ├── llms.txt             # AI 发现清单
│       │   └── llms-full.txt        # 完整 LLM 知识库文档
│       └── src/
│           ├── components/          # 3D 响应球体、Bento 架构网格、控制台 HUD、CTA
│           └── pages/index.astro    # 国际化（简/繁/英）展示主页
├── tools/                           # 本地端到端验证测试套件
│   ├── test_node.mjs                # 无浏览器环境 Node.js 端到端识别精度与 RTF 测试
│   └── split_model.py               # 模型多切片切分脚本 (生成 <=20MB 分片与 manifest)
├── LICENSE                          # Apache 2.0 开源协议
├── README.md                        # 英文主文档
├── README-CN.md                     # 简体中文文档 (本文件)
└── package.json                     # Monorepo 根工作区配置
```

---

## 📦 安装方式

通过适合你工程的包管理器安装 `@firetable/stream-asr`：

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

## 🚀 极简接入指南

### 1. 基础流式识别范例

```typescript
import { StreamRecognizer } from '@firetable/stream-asr';

// 1. 初始化识别器（默认采用 Mode 3 通用流式 + 神经网络 VAD）
const recognizer = new StreamRecognizer({
  modelUrl: '/model.bin',     // 模型二进制包路径或 CDN 直链
  wasmBaseUrl: '/wasm',       // stream_asr.wasm 与 stream_asr.js 存放路径
  mode: 3,                    // 3 = 通用流式 + VAD 断句（推荐）
  vadThreshold: 0.5,          // VAD 语音激活灵敏度 (0.0 ~ 1.0)
  enableCache: true           // 开启 IndexedDB 离线缓存，后续访问秒开
});

// 2. 监听实时流式事件
recognizer.on('recognizing', ({ text, vadState }) => {
  // 边说边实时出字（延迟低至 120ms）
  console.log('[实时流式文字]:', text);
});

recognizer.on('recognized', ({ text, tokenCount, inferenceMs }) => {
  // 人声停顿截断或标点落定后触发完整句子
  console.log('[完整句子结束]:', text, `(${tokenCount} 个字词，耗时 ${inferenceMs}ms)`);
});

recognizer.on('vad_state_change', ({ stateName }) => {
  // 'SILENCE' (静音) | 'SPEECH' (正在说话) | 'PAUSE' (停顿断句)
  console.log('[VAD 状态]:', stateName);
});

// 3. 启动引擎（拉取模型或从缓存加载，并编译装载 WebAssembly）
await recognizer.init();
console.log('Stream ASR 引擎就绪！');

// 4. 实时传入 Float32Array PCM 音频流
// 支持任意硬件输入采样率（16000, 44100, 48000 等，自动重采样）
recognizer.feed(pcmChunk, audioContext.sampleRate);

// 5. 录音结束时，清空残留音频帧
recognizer.finish();
```

---

### 2. 浏览器麦克风实时拾音完整接入代码

```typescript
import { StreamRecognizer } from '@firetable/stream-asr';

async function startMicrophoneASR() {
  const recognizer = new StreamRecognizer({
    modelUrl: '/model.bin',
    wasmBaseUrl: '/wasm',
    mode: 3,
  });

  recognizer.on('recognizing', ({ text }) => {
    document.getElementById('subtitle')!.innerText = text;
  });

  recognizer.on('recognized', ({ text }) => {
    console.log('整句归档:', text);
  });

  await recognizer.init();

  // 请求麦克风权限
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
  const processorNode = audioCtx.createScriptProcessor(4096, 1, 1);

  processorNode.onaudioprocess = (e) => {
    const inputPcm = e.inputBuffer.getChannelData(0);
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

## 🛠️ 参数与 API 详查

### 配置选项 `StreamRecognizerOptions`

| 选项名称 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `modelUrl` | `string` | `'/model.bin'` | 模型容器二进制文件路径或切片清单（`model.json`）。 |
| `wasmBaseUrl` | `string` | `'/wasm'` | 托管 `stream_asr.wasm` 与 `stream_asr.js` 的目录路径。 |
| `mode` | `ASRMode` | `3` | `1`（短句极速流式）或 `3`（通用长流式 + 神经 VAD 断句）。 |
| `sampleRate` | `number` | `16000` | 目标识别采样率（单位 Hz）。 |
| `vadThreshold` | `number` | `0.5` | 神经网络静音检测激活灵敏度（0.0 ~ 1.0）。 |
| `speechPauseThreshold` | `number` | `0.925` | 停顿窗口中静音帧占比触发断句的阈值。 |
| `minSpeechDurationMs` | `number` | `480` | 触发人声开始所需的最小毫秒数。 |
| `maxPauseDurationMs` | `number` | `2080` | 判定为停顿断句所需的静音毫秒数。 |
| `maxSegmentDurationSec` | `number` | `20` | 单句最大持续秒数，超时强制标点截断。 |
| `enableCache` | `boolean` | `true` | 是否在浏览器 IndexedDB 中持久化缓存模型。 |
| `modelVersion` | `string` | `'1.0.0'` | 模型版本标识，更新此值会自动失效旧缓存并拉取新模型。 |
| `enablePostSmooth` | `boolean` | `true` | 是否启用语气词过滤与逗号句号标点生成。 |
| `chunks` | `string[]` | `undefined` | 显式分片下载 URL 数组，并发拉取并在内存组装。 |
| `debug` | `boolean` | `true` | 是否在控制台打印详细调试日志。 |

---

## 🌐 支持语种说明

- **中文（普通话）**：原生支持标准普通话、日常对话、技术词汇及中英混合听写；
- **英文**：支持日常交流、专业术语的高精度因果转写，带智能大小写与标点。

> [!NOTE]
> 出于严谨的声学工程标准，模型词表不包含粤语特定专用字，因此本项目明确仅支持**中文（普通话）与英文**，严禁用于非目标方言输入以避免同音字强制失真。

---

## 💻 浏览器与宿主环境兼容性

| 运行环境 | 最低版本要求 | SIMD128 加速 | 是否需要特殊跨域隔离头 (COOP/COEP) |
| :--- | :---: | :---: | :---: |
| **Google Chrome / Chromium** | 90+ | ✅ 支持 | ✅ **不需要（零服务端改造）** |
| **Microsoft Edge** | 90+ | ✅ 支持 | ✅ 不需要 |
| **Apple Safari (macOS & iOS)** | 16.4+ | ✅ 支持 | ✅ 不需要 |
| **Mozilla Firefox** | 90+ | ✅ 支持 | ✅ 不需要 |
| **Electron** | 13.0+ | ✅ 支持 | ✅ 不需要 |
| **Tauri** | 1.0+ | ✅ 支持 | ✅ 不需要 |

---

## 📄 开源协议

本项目采用 **[Apache License 2.0](LICENSE)** 协议开源。
个人学习、学术研究与商业集成均完全免费。
