# Multi-Worker & Multi-Threading Guide (多 Worker / 多线程运行指南)

This guide explains how to enable and optimize **Multi-Worker parallel WebAssembly inference** in `@firetable/stream-asr`, including browser security requirements, server HTTP header configuration, and performance benchmarks.

本指南详细介绍如何在 `@firetable/stream-asr` 中启用并优化 **多 Worker / 多线程 WebAssembly 并行推理**，包括浏览器跨域隔离安全规范、各大静态与动态服务器 HTTP 头配置，以及实测性能对比。

---

## 1. Architecture: Single-Worker vs Multi-Worker

| Feature | Single-Worker (`stream_asr.wasm`) | Multi-Worker (`stream_asr.threaded.wasm`) |
| :--- | :--- | :--- |
| **Execution Engine** | 1 Dedicated Web Worker (SIMD128) | 1 Coordinator Worker + N Compute Worker Threads (Pthreads + SIMD128) |
| **HTTP Header Requirements** | **None** (Zero-config, works everywhere) | **COOP & COEP** (`crossOriginIsolated`) required for `SharedArrayBuffer` |
| **Real-Time Factor (RTF)** | **~0.45x - 0.52x** | **~0.22x - 0.33x** (up to **2.4x faster**) |
| **Memory Footprint** | ~185 MB total in MEMFS/WASM | ~185 MB total (**SharedArrayBuffer**, memory is shared, NOT duplicated) |
| **Best For** | Any standard website, Webviews, extensions | High-performance desktop/mobile web apps, low-latency live subtitles |

### Memory Scaling: Does multi-worker double RAM usage? (开启多 Worker 内存会翻倍吗？)
**No.** All worker threads in Emscripten Pthreads share the same underlying `WebAssembly.Memory` backed by a single `SharedArrayBuffer`. The 40-layer Transformer acoustic model weights, KV-caches, and MEMFS filesystem exist in a single shared memory block. Each additional worker only allocates a lightweight thread execution stack (~1MB), resulting in negligible additional memory overhead.

不会翻倍。所有 Worker 线程基于 `SharedArrayBuffer` 共享同一块 `WebAssembly.Memory` 内存空间，声学模型权重与因果 KV-Cache 在内存中仅保留一份，多 Worker 仅各自占用微量的调用栈（约 1MB），内存占用几乎没有增加。

---

## 2. Performance Benchmarks (实测性能对比)

Measured on 7.20-second test speech (`test.wav`), 16kHz mono audio, Mode 3 Universal Causal Streaming:

| Mode & Thread Count | Inference Time (Wall) | Real-Time Factor (RTF) | Relative Speedup | Token Accuracy |
| :--- | :--- | :--- | :--- | :--- |
| **Single-Worker (1 Thread)** | 3856.7 ms | 0.535x | 1.00x (Baseline) | 100% exact match |
| **Multi-Worker (2 Threads)** | 2378.7 ms | 0.330x | **1.62x faster** | 100% exact match |
| **Multi-Worker (4 Threads)** | 1612.0 ms | 0.224x | **2.39x faster** | 100% exact match |

> 💡 **Mobile Recommendation (移动端建议)**:
> On mobile devices (iOS Safari / Android Chrome), **2 threads** (`numThreads: 2`) is the sweet spot. It delivers a 1.6x latency reduction while preserving battery life and avoiding CPU thermal throttling. On laptops and desktops, **4 threads** (`numThreads: 4`) delivers peak throughput.
> 在手机浏览器端，推荐配置为 **2 线程**（`numThreads: 2`），可在获得 1.6 倍极速加速的同时兼顾机身发热与功耗；在桌面端和笔记本上，推荐 **4 线程**（`numThreads: 4`）释放极致性能。

---

## 3. Browser Security Prerequisite: Cross-Origin Isolation

WebAssembly multi-threading relies on `SharedArrayBuffer` and `Atomics`. Modern web browsers require that the hosting page be in a **Cross-Origin Isolated** state (`window.crossOriginIsolated === true`).

If these headers are missing, browsers will block `SharedArrayBuffer`. **`@firetable/stream-asr` includes zero-crash graceful fallback**: if cross-origin isolation is absent, the SDK automatically falls back to single-worker mode without throwing errors.

要使用 `SharedArrayBuffer` 进行多 Worker 线程池加速，浏览器要求主页面必须处于**跨域隔离状态**（`crossOriginIsolated === true`）。如果未配置相关 HTTP 响应头，SDK 会**自动优雅降级为单 Worker 模式**，保证 100% 可用、绝不崩溃。

### Required HTTP Headers
```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: cross-origin
```

---

## 4. Server Configuration Guide (服务器配置指南)

### Cloudflare Pages
Create or edit `public/_headers`:
```http
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  Cross-Origin-Resource-Policy: cross-origin
```

### Vercel
Add headers in `vercel.json`:
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
        { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" },
        { "key": "Cross-Origin-Resource-Policy", "value": "cross-origin" }
      ]
    }
  ]
}
```

### Next.js
Configure `next.config.js` (or `next.config.mjs`):
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
          { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
```

### Vite (Local Dev & Preview)
In `vite.config.ts`:
```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
```

### Astro
In `astro.config.mjs`:
```javascript
import { defineConfig } from 'astro/config';

export default defineConfig({
  vite: {
    server: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
    },
    preview: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
    },
  },
});
```

### Nginx
In your server or location block in `nginx.conf`:
```nginx
server {
    listen 443 ssl http2;
    server_name asr.example.com;

    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "require-corp" always;
    add_header Cross-Origin-Resource-Policy "cross-origin" always;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### Caddy
In your `Caddyfile`:
```caddy
asr.example.com {
    header {
        Cross-Origin-Opener-Policy "same-origin"
        Cross-Origin-Embedder-Policy "require-corp"
        Cross-Origin-Resource-Policy "cross-origin"
    }
    root * /var/www/stream-asr
    file_server
}
```

### Apache (`.htaccess`)
```apache
<IfModule mod_headers.c>
    Header set Cross-Origin-Opener-Policy "same-origin"
    Header set Cross-Origin-Embedder-Policy "require-corp"
    Header set Cross-Origin-Resource-Policy "cross-origin"
</IfModule>
```

---

## 5. SDK Usage Guide (SDK 代码用法)

### Option 1: Automatic Detection (Recommended)
By default, `numThreads: 'auto'` probes `window.crossOriginIsolated`. If the server headers are active, it boots multi-worker with the optimal thread count (up to 4). If not, it smoothly defaults to single-worker mode without errors.

```typescript
import { StreamRecognizer } from '@firetable/stream-asr';

const recognizer = new StreamRecognizer({
  modelUrl: '/model.bin',
  wasmBaseUrl: '/wasm',
  // 'auto': uses multi-worker if COOP/COEP headers are present, falls back to 1 thread if not
  numThreads: 'auto',
});

recognizer.on('ready', ({ threads, isMultiWorker }) => {
  console.log(`Stream ASR initialized with ${threads} threads (Multi-worker: ${isMultiWorker})`);
});

await recognizer.init();
```

### Option 2: Explicit Thread Count
You can specify exact thread counts (`1`, `2`, `4`):

```typescript
const recognizer = new StreamRecognizer({
  modelUrl: '/model.bin',
  wasmBaseUrl: '/wasm',
  numThreads: 2, // Explicitly request 2 worker threads (Mobile sweet spot)
});

await recognizer.init();

// Inspect active runtime status at any time
console.log('Active Threads:', recognizer.threads); // e.g. 2
console.log('Is Multi-Worker:', recognizer.isMultiWorker); // e.g. true
```

### Option 3: Force Single-Worker Everywhere
If you want guaranteed compatibility on platforms where you cannot modify HTTP headers:

```typescript
const recognizer = new StreamRecognizer({
  modelUrl: '/model.bin',
  wasmBaseUrl: '/wasm',
  numThreads: 1, // Guaranteed single-worker mode (requires zero HTTP headers)
});

await recognizer.init();
```

### Helper: Pre-Flight Environment Check
```typescript
import { StreamRecognizer } from '@firetable/stream-asr';

if (StreamRecognizer.isMultiWorkerSupported()) {
  console.log('Browser environment supports SharedArrayBuffer & Multi-Worker acceleration!');
} else {
  console.log('Running in standard single-worker compatibility mode.');
}
```
