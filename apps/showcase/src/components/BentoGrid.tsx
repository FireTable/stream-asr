import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { translations, getInitialLang, type Lang } from '../i18n/translations';
import SpotlightCard from './SpotlightCard';
import CountUp from './CountUp';

export default function BentoGrid() {
  const [lang, setLang] = useState<Lang>(getInitialLang);

  useEffect(() => {
    setLang(getInitialLang());
    const handleLang = (e: Event) => {
      const customEvent = e as CustomEvent<Lang>;
      if (customEvent.detail) setLang(customEvent.detail);
    };
    window.addEventListener('stream_asr_lang_change', handleLang);
    return () => window.removeEventListener('stream_asr_lang_change', handleLang);
  }, []);

  const t = (translations[lang] || translations['zh-cn']) as any;
  const b = t.bento || {};

  return (
    <section id="features" className="w-full max-w-6xl px-4 sm:px-6 lg:px-8 pt-16 sm:pt-24 pb-6 sm:pb-10 scroll-mt-14 sm:scroll-mt-20">
      {/* Section Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-50px' }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="text-center mb-12 sm:mb-16"
      >
        <h2 className="text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
          {b.title || '工业级核心特性与基准对标'}
        </h2>
        <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 mt-3 max-w-2xl mx-auto leading-relaxed">
          {b.subtitle || '专为 40 层 INT8 因果声学图打造的独立运行时 · 纯端侧 WebAssembly 实时推理'}
        </p>
      </motion.div>

      {/* =========================================================
          APPLE BENTO GRID (Single Screen Overview)
          Asymmetric 12-Column High-Density Layout with Pixel-Perfect Alignment
          ========================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        {/* =======================================================
            CARD 1 (Span 7): Benchmarks & Ultra-Low RTF
            ======================================================= */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="lg:col-span-7 h-full"
        >
          <SpotlightCard
            className="p-6 sm:p-8 h-full"
            spotlightColor="rgba(56, 189, 248, 0.16)"
          >
            {/* Header: Strict uniform height across Row 1 */}
            <div className="flex flex-col mb-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-400/10 dark:text-sky-400 dark:border-sky-400/20">
                  {b.card1Badge || '0.46x RTF · 极限实时率'}
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight leading-snug">
                {b.card1Title || '超实时因果推理基准对标'}
              </h3>
              <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 mt-2 leading-relaxed min-h-[40px]">
                {b.card1Desc || '基于 MNN 3.2.6 单核引擎与 Wasm SIMD128 向量化指令，0.45 秒内即可完成 1 秒音频转写。'}
              </p>
            </div>

            {/* Visual: Benchmark Comparison Bars (Starts at exact same baseline as Card 2) */}
            <div className="space-y-2.5 font-mono text-xs">
              {/* Project (FireTable Stream ASR) */}
              <div className="p-3 rounded-2xl bg-sky-50 border border-sky-200 dark:bg-sky-500/10 dark:border-sky-400/30 relative overflow-hidden">
                <div className="flex items-center justify-between relative z-10 font-semibold text-sky-800 dark:text-sky-300 mb-1.5 text-xs">
                  <span>{b.card1This || '@firetable/stream-asr (This)'}</span>
                  <span className="text-sky-600 dark:text-sky-400 font-bold flex items-center gap-1">
                    <CountUp to={0.457} from={0.95} duration={1.5} decimals={3} suffix="x" />
                    <span>· &lt; 120ms</span>
                  </span>
                </div>
                <div className="w-full bg-zinc-200 dark:bg-zinc-900/60 rounded-full h-2 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: '100%' }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                    className="bg-gradient-to-r from-sky-500 to-cyan-400 dark:from-sky-400 dark:to-cyan-300 h-2 rounded-full shadow-[0_0_12px_rgba(56,189,248,0.5)]"
                  />
                </div>
                <div className="flex justify-between text-[10px] text-sky-700/90 dark:text-sky-400/80 mt-1.5">
                  <span>Wasm SIMD128 + MNN</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {b.card1ThisTag || '100% 纯端侧 · 0 云端依赖'}
                  </span>
                </div>
              </div>

              {/* SenseVoice Small */}
              <div className="p-2.5 rounded-2xl bg-zinc-100/80 dark:bg-white/[0.02] border border-zinc-200/80 dark:border-white/[0.05]">
                <div className="flex items-center justify-between text-zinc-600 dark:text-zinc-400 mb-1 text-xs">
                  <span>SenseVoice Small (ONNX Web)</span>
                  <span className="text-zinc-500">~0.75x · &gt; 800ms</span>
                </div>
                <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: '61%' }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.2, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                    className="bg-zinc-400 dark:bg-zinc-600 h-1.5 rounded-full"
                  />
                </div>
              </div>

              {/* Whisper.cpp int8 */}
              <div className="p-2.5 rounded-2xl bg-zinc-100/80 dark:bg-white/[0.02] border border-zinc-200/80 dark:border-white/[0.05]">
                <div className="flex items-center justify-between text-zinc-600 dark:text-zinc-400 mb-1 text-xs">
                  <span>Whisper.cpp (int8 Wasm SIMD)</span>
                  <span className="text-zinc-500">~0.85x · ~600ms</span>
                </div>
                <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: '54%' }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.2, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="bg-zinc-400 dark:bg-zinc-600 h-1.5 rounded-full"
                  />
                </div>
              </div>

              {/* Cloud ASR */}
              <div className="p-2.5 rounded-2xl bg-zinc-100/80 dark:bg-white/[0.02] border border-zinc-200/80 dark:border-white/[0.05]">
                <div className="flex items-center justify-between text-zinc-600 dark:text-zinc-400 mb-1 text-xs">
                  <span>Cloud ASR APIs (Cluster)</span>
                  <span className="text-amber-600 dark:text-amber-500 font-medium">
                    {b.card1CloudJitter || '~0.30x + 400ms 网络抖动'}
                  </span>
                </div>
                <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: '85%' }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.2, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    className="bg-red-400/50 h-1.5 rounded-full"
                  />
                </div>
                <div className="flex justify-between text-[10px] text-zinc-500 mt-1">
                  <span>Cloud GPU Cluster</span>
                  <span className="text-red-500 dark:text-red-400/80 font-medium">
                    {b.card1CloudRisk || '音频出网 · 合规风险'}
                  </span>
                </div>
              </div>
            </div>
          </SpotlightCard>
        </motion.div>

        {/* =======================================================
            CARD 2 (Span 5): Zero-Cloud Privacy Vault
            ======================================================= */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="lg:col-span-5 h-full"
        >
          <SpotlightCard
            className="p-6 sm:p-8 h-full"
            spotlightColor="rgba(16, 185, 129, 0.14)"
          >
            {/* Header: Strict uniform height matching Card 1 */}
            <div className="flex flex-col mb-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-400 dark:border-emerald-400/20">
                  {b.card2Badge || 'Zero-Cloud · 0 隐私泄漏'}
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight leading-snug">
                {b.card2Title || '100% 纯端侧 · 隐私零外发'}
              </h3>
              <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 mt-2 leading-relaxed min-h-[40px]">
                {b.card2Desc || '原始麦克风音频全程在内存处理，绝无网络外发，满足企业与医疗级隐私合规诉求。'}
              </p>
            </div>

            {/* Visual: Balanced Telemetry & Motion Pipeline (Starts at exact same baseline as Card 1) */}
            <div className="flex flex-col gap-2.5 font-mono text-xs">
              {/* Animated In-Memory Pipeline Flow Widget */}
              <div className="p-2.5 rounded-2xl bg-zinc-100/90 dark:bg-zinc-950/60 border border-zinc-200/80 dark:border-white/[0.06] relative overflow-hidden">
                <div className="flex items-center justify-between text-[11px] mb-1.5 px-1">
                  <div className="text-zinc-700 dark:text-zinc-300 font-medium">
                    <span>{b.card2Pcm || '麦克风 PCM'}</span>
                  </div>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold tracking-wider">
                    {b.card2Flow || '100% 内存流转'}
                  </span>
                  <div className="text-zinc-700 dark:text-zinc-300 font-medium">
                    <span>{b.card2Sandbox || 'Wasm 沙箱'}</span>
                  </div>
                </div>

                {/* Animated Particle Light Stream */}
                <div className="w-full h-1 bg-zinc-200 dark:bg-zinc-800 rounded-full relative overflow-hidden my-1">
                  <motion.div
                    animate={{ x: [-20, 260] }}
                    transition={{ repeat: Infinity, duration: 1.8, ease: 'linear' }}
                    className="w-16 h-full bg-gradient-to-r from-transparent via-emerald-400 to-transparent"
                  />
                </div>
              </div>

              {/* Privacy & Security Telemetry Checklist */}
              <div className="p-2.5 rounded-xl bg-zinc-100/70 dark:bg-zinc-950/40 border border-zinc-200/70 dark:border-white/[0.05] flex items-center justify-between">
                <span className="text-zinc-500 dark:text-zinc-400 text-xs">{b.card2AuditNetwork || '网络外发请求'}</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{b.card2AuditNetworkVal || '0 次 (物理无外联)'}</span>
              </div>

              <div className="p-2.5 rounded-xl bg-zinc-100/70 dark:bg-zinc-950/40 border border-zinc-200/70 dark:border-white/[0.05] flex items-center justify-between">
                <span className="text-zinc-500 dark:text-zinc-400 text-xs">{b.card2AuditStorage || '音频数据留存'}</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{b.card2AuditStorageVal || '0 字节 (转写即弃)'}</span>
              </div>

              <div className="p-2.5 rounded-xl bg-zinc-100/70 dark:bg-zinc-950/40 border border-zinc-200/70 dark:border-white/[0.05] flex items-center justify-between">
                <span className="text-zinc-500 dark:text-zinc-400 text-xs">{b.card2AuditSandbox || '执行环境隔离'}</span>
                <span className="text-zinc-800 dark:text-zinc-200 font-medium">{b.card2AuditSandboxVal || 'Wasm 独立线性沙箱'}</span>
              </div>

              {/* Air-Gapped Verification Banner */}
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300 font-mono text-[11px] flex items-center justify-between">
                <span className="text-emerald-700 dark:text-emerald-400/90">{b.card2AuditStatus || '网络抓包: 0 KB/s · 零遥测'}</span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider">Air-Gapped</span>
              </div>
            </div>
          </SpotlightCard>
        </motion.div>

        {/* =======================================================
            CARD 3 (Span 5): Neural VAD & Segmentation
            ======================================================= */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.6, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="lg:col-span-5 h-full"
        >
          <SpotlightCard
            className="p-6 sm:p-8 h-full"
            spotlightColor="rgba(251, 191, 36, 0.14)"
          >
            {/* Header: Strict uniform height matching Card 4 */}
            <div className="flex flex-col mb-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-400/10 dark:text-amber-400 dark:border-amber-400/20">
                  {b.card3Badge || '1.1MB 神经网络 VAD'}
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight leading-snug">
                {b.card3Title || '毫秒级停顿截断与智能标点'}
              </h3>
              <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 mt-2 leading-relaxed min-h-[40px]">
                {b.card3Desc || '内置因果声学概率分类器，自主探测人声呼吸停顿并切割语义段落，字节级 BPE 贪婪解码与智能标点。'}
              </p>
            </div>

            {/* Visual: Waveform Motion Graphic */}
            <div className="p-4 rounded-2xl bg-zinc-100/80 dark:bg-zinc-950/60 border border-zinc-200/80 dark:border-white/[0.06] flex flex-col gap-3">
              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 dark:text-zinc-400">
                <span>SPEECH (0.92)</span>
                <span className="text-amber-600 dark:text-amber-400 font-bold px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                  {b.card3Pause || 'PAUSE 探测截断'}
                </span>
                <span className="text-zinc-400">SILENCE (&lt; 0.1)</span>
              </div>

              {/* Dynamic Animated Waveform Slices */}
              <div className="h-10 w-full flex items-center justify-between gap-1 px-1">
                {[35, 60, 85, 95, 80, 50, 20, 8, 8, 8, 45, 75, 90, 85, 65, 30, 10, 8, 8].map((h, i) => (
                  <motion.div
                    key={i}
                    animate={{
                      height: [
                        `${h}%`,
                        `${Math.min(100, Math.max(12, h + (i % 2 === 0 ? 15 : -15)))}%`,
                        `${h}%`
                      ]
                    }}
                    transition={{
                      repeat: Infinity,
                      duration: 1.6,
                      delay: i * 0.06,
                      ease: 'easeInOut'
                    }}
                    className={`w-full rounded-full transition-colors ${
                      i >= 6 && i <= 9
                        ? 'bg-amber-500 dark:bg-amber-400/80 shadow-[0_0_8px_rgba(251,191,36,0.4)]'
                        : 'bg-sky-500 dark:bg-sky-400'
                    }`}
                  />
                ))}
              </div>

              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 pt-2 border-t border-zinc-200/80 dark:border-white/[0.05]">
                <span>{b.card3Threshold || '分段阈值: 0.50'}</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  {b.card3Punctuation || '自适应插入标点「，」「。」'}
                </span>
              </div>
            </div>
          </SpotlightCard>
        </motion.div>

        {/* =======================================================
            CARD 4 (Span 7): 40-Layer INT8 Causal Pipeline
            ======================================================= */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="lg:col-span-7 h-full"
        >
          <SpotlightCard
            className="p-6 sm:p-8 h-full"
            spotlightColor="rgba(99, 102, 241, 0.16)"
          >
            {/* Header: Strict uniform height matching Card 3 */}
            <div className="flex flex-col mb-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-400/10 dark:text-indigo-400 dark:border-indigo-400/20">
                  {b.card4Badge || '40 层 INT8 因果图'}
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight leading-snug">
                {b.card4Title || '解耦式时域流水线架构'}
              </h3>
              <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 mt-2 leading-relaxed min-h-[40px]">
                {b.card4Desc || '从 Kaldi 80 维 FBank 特征提取到 MNN 因果计算图，全组件在连续线性内存中确定性执行。'}
              </p>
            </div>

            {/* Visual: 4 Pipeline Stage Nodes with Motion Stream Line */}
            <div className="flex flex-col gap-2.5 font-mono text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 relative">
                {/* Node 01 */}
                <motion.div
                  whileHover={{ y: -2 }}
                  transition={{ duration: 0.2 }}
                  className="p-3 rounded-2xl bg-zinc-100/80 dark:bg-zinc-950/60 border border-zinc-200/80 dark:border-white/[0.06] flex flex-col gap-1"
                >
                  <span className="text-sky-600 dark:text-sky-400 font-bold text-[10px]">
                    {b.card4Node1Title || '01 / 预处理'}
                  </span>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200 text-xs">Kaldi FBank</span>
                  <span className="text-[10px] text-zinc-500 leading-tight">
                    {b.card4Node1Desc || '80 维特征提取'}
                  </span>
                </motion.div>

                {/* Node 02 (Core Acoustic Engine) */}
                <motion.div
                  whileHover={{ y: -2 }}
                  transition={{ duration: 0.2 }}
                  className="p-3 rounded-2xl bg-sky-50 dark:bg-zinc-950/80 border border-sky-400/40 dark:border-sky-400/30 shadow-[0_0_12px_rgba(56,189,248,0.12)] flex flex-col gap-1 relative overflow-hidden"
                >
                  <span className="text-sky-600 dark:text-sky-400 font-bold text-[10px]">
                    {b.card4Node2Title || '02 / 声学网络'}
                  </span>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100 text-xs">Causal INT8</span>
                  <span className="text-[10px] text-zinc-600 dark:text-zinc-400 leading-tight">
                    {b.card4Node2Desc || '40 层 Transformer'}
                  </span>
                </motion.div>

                {/* Node 03 */}
                <motion.div
                  whileHover={{ y: -2 }}
                  transition={{ duration: 0.2 }}
                  className="p-3 rounded-2xl bg-zinc-100/80 dark:bg-zinc-950/60 border border-zinc-200/80 dark:border-white/[0.06] flex flex-col gap-1"
                >
                  <span className="text-sky-600 dark:text-sky-400 font-bold text-[10px]">
                    {b.card4Node3Title || '03 / 语音截断'}
                  </span>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200 text-xs">Neural VAD</span>
                  <span className="text-[10px] text-zinc-500 leading-tight">
                    {b.card4Node3Desc || '毫秒级静音探测'}
                  </span>
                </motion.div>

                {/* Node 04 */}
                <motion.div
                  whileHover={{ y: -2 }}
                  transition={{ duration: 0.2 }}
                  className="p-3 rounded-2xl bg-zinc-100/80 dark:bg-zinc-950/60 border border-zinc-200/80 dark:border-white/[0.06] flex flex-col gap-1"
                >
                  <span className="text-sky-600 dark:text-sky-400 font-bold text-[10px]">
                    {b.card4Node4Title || '04 / 解码上屏'}
                  </span>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200 text-xs">TextDecoder</span>
                  <span className="text-[10px] text-zinc-500 leading-tight">
                    {b.card4Node4Desc || 'BPE 贪婪平滑'}
                  </span>
                </motion.div>
              </div>

              {/* Architectural Telemetry Spec Footer */}
              <div className="p-2.5 rounded-xl bg-zinc-100/70 dark:bg-zinc-950/40 border border-zinc-200/70 dark:border-white/[0.05] flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400 px-3">
                <span className="text-sky-700 dark:text-sky-400/90 font-medium">
                  {b.card4Spec1 || '80 维 FBank · 10ms 帧移'}
                </span>
                <span className="text-zinc-400">|</span>
                <span className="text-zinc-700 dark:text-zinc-300 font-medium">
                  {b.card4Spec2 || '连续线性内存 · 零 GC 停顿'}
                </span>
                <span className="text-zinc-400">|</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  {b.card4Spec3 || 'SIMD128 4x 加速'}
                </span>
              </div>
            </div>
          </SpotlightCard>
        </motion.div>
      </div>
    </section>
  );
}
