import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Terminal, 
  Copy, 
  Check, 
  ArrowUpRight, 
  ArrowUp 
} from 'lucide-react';
import { translations, getInitialLang, type Lang } from '../i18n/translations';
import SpotlightCard from './SpotlightCard';

type TabMode = 'ai' | 'cli';
type PkgManager = 'pnpm' | 'npm' | 'yarn' | 'bun';

const RAW_EXAMPLE_CODE = `import { StreamRecognizer } from '@firetable/stream-asr';

const recognizer = new StreamRecognizer({
  modelUrl: '/model.bin',
  wasmBaseUrl: '/wasm',
  mode: 3, // Universal Streaming with Neural VAD
  vadThreshold: 0.5
});

recognizer.on('recognizing', ({ text }) => console.log('Live:', text));
recognizer.on('recognized', ({ text }) => console.log('Final Sentence:', text));

await recognizer.init();
recognizer.feed(pcmChunk, 16000, false);`;

// Unified, Pixel-Perfect Copy Button
interface CopyButtonProps {
  copied: boolean;
  onClick: () => void;
  label?: string;
  copiedLabel?: string;
  className?: string;
}

const CopyButton = ({ copied, onClick, label = '复制', copiedLabel = '已复制', className = '' }: CopyButtonProps) => (
  <button
    onClick={onClick}
    className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-sans font-medium transition-all duration-150 active:scale-95 cursor-pointer select-none border backdrop-blur-xs ${
      copied
        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
        : 'bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 hover:text-white border-zinc-700/60 shadow-xs'
    } ${className}`}
    title={copied ? copiedLabel : label}
  >
    {copied ? (
      <>
        <Check className="w-3.5 h-3.5 text-emerald-400" />
        <span className="text-emerald-400 font-semibold">{copiedLabel}</span>
      </>
    ) : (
      <>
        <Copy className="w-3.5 h-3.5 text-zinc-400" />
        <span>{label}</span>
      </>
    )}
  </button>
);

// High-Fidelity TypeScript Syntax Highlighter (0 runtime dependencies)
const HighlightedTypeScript = () => (
  <pre className="font-mono text-xs sm:text-sm leading-relaxed overflow-x-auto whitespace-pre select-all text-zinc-200 m-0 p-0 bg-transparent">
    <span className="text-purple-400 font-semibold">import</span>
    <span className="text-zinc-200"> {'{ '}</span>
    <span className="text-amber-300 font-medium">StreamRecognizer</span>
    <span className="text-zinc-200">{' }'} </span>
    <span className="text-purple-400 font-semibold">from</span>
    <span className="text-emerald-400"> '@firetable/stream-asr'</span>
    <span className="text-zinc-500">;</span>
    {'\n\n'}
    <span className="text-purple-400 font-semibold">const</span>
    <span className="text-zinc-100"> recognizer</span>
    <span className="text-zinc-400"> = </span>
    <span className="text-purple-400 font-semibold">new</span>
    <span className="text-amber-300 font-medium"> StreamRecognizer</span>
    <span className="text-zinc-200">({'{'}</span>
    {'\n  '}
    <span className="text-sky-300">modelUrl</span>
    <span className="text-zinc-400">: </span>
    <span className="text-emerald-400">'/model.bin'</span>
    <span className="text-zinc-500">,</span>
    {'\n  '}
    <span className="text-sky-300">wasmBaseUrl</span>
    <span className="text-zinc-400">: </span>
    <span className="text-emerald-400">'/wasm'</span>
    <span className="text-zinc-500">,</span>
    {'\n  '}
    <span className="text-sky-300">mode</span>
    <span className="text-zinc-400">: </span>
    <span className="text-amber-400 font-semibold">3</span>
    <span className="text-zinc-500">, </span>
    <span className="text-zinc-500 italic">// Universal Streaming with Neural VAD</span>
    {'\n  '}
    <span className="text-sky-300">vadThreshold</span>
    <span className="text-zinc-400">: </span>
    <span className="text-amber-400 font-semibold">0.5</span>
    {'\n'}
    <span className="text-zinc-200">{'}'});</span>
    {'\n\n'}
    <span className="text-zinc-200">recognizer.</span>
    <span className="text-blue-400">on</span>
    <span className="text-zinc-200">(</span>
    <span className="text-emerald-400">'recognizing'</span>
    <span className="text-zinc-400">, ({'{ '}</span>
    <span className="text-sky-200">text</span>
    <span className="text-zinc-400">{' }'}) </span>
    <span className="text-purple-400 font-semibold">=&gt;</span>
    <span className="text-zinc-200"> console.</span>
    <span className="text-blue-400">log</span>
    <span className="text-zinc-200">(</span>
    <span className="text-emerald-400">'Live:'</span>
    <span className="text-zinc-500">, </span>
    <span className="text-sky-200">text</span>
    <span className="text-zinc-200">));</span>
    {'\n'}
    <span className="text-zinc-200">recognizer.</span>
    <span className="text-blue-400">on</span>
    <span className="text-zinc-200">(</span>
    <span className="text-emerald-400">'recognized'</span>
    <span className="text-zinc-400">, ({'{ '}</span>
    <span className="text-sky-200">text</span>
    <span className="text-zinc-400">{' }'}) </span>
    <span className="text-purple-400 font-semibold">=&gt;</span>
    <span className="text-zinc-200"> console.</span>
    <span className="text-blue-400">log</span>
    <span className="text-zinc-200">(</span>
    <span className="text-emerald-400">'Final Sentence:'</span>
    <span className="text-zinc-500">, </span>
    <span className="text-sky-200">text</span>
    <span className="text-zinc-200">));</span>
    {'\n\n'}
    <span className="text-purple-400 font-semibold">await</span>
    <span className="text-zinc-200"> recognizer.</span>
    <span className="text-blue-400">init</span>
    <span className="text-zinc-200">();</span>
    {'\n'}
    <span className="text-zinc-200">recognizer.</span>
    <span className="text-blue-400">feed</span>
    <span className="text-zinc-200">(pcmChunk, </span>
    <span className="text-amber-400 font-semibold">16000</span>
    <span className="text-zinc-500">, </span>
    <span className="text-purple-400 font-semibold">false</span>
    <span className="text-zinc-200">);</span>
  </pre>
);

// High-Fidelity Structured Prompt Highlighter (Adaptive Package Manager)
const HighlightedPrompt = ({ lang }: { lang: Lang }) => {
  if (lang === 'en') {
    return (
      <div className="font-mono text-xs sm:text-sm leading-normal sm:leading-snug select-all text-zinc-200 space-y-2">
        <p className="text-zinc-300">
          Please integrate <span className="text-sky-400 font-semibold">@firetable/stream-asr</span> on-device streaming speech recognition into this project:
        </p>
        <p>
          <span className="text-zinc-500 font-bold">1. </span>
          <span className="text-zinc-300">Install </span>
          <span className="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 font-semibold">@firetable/stream-asr</span>
          <span className="text-zinc-400"> using this project's package manager (npm / pnpm / yarn / bun)</span>
        </p>
        <p>
          <span className="text-zinc-500 font-bold">2. </span>
          <span className="text-zinc-300">Create a </span>
          <span className="text-amber-300 font-semibold">StreamRecognizer</span>
          <span className="text-zinc-300"> instance using </span>
          <span className="text-purple-300 font-medium">Mode 3</span>
          <span className="text-zinc-300"> (Causal Streaming + Neural VAD)</span>
        </p>
        <p>
          <span className="text-zinc-500 font-bold">3. </span>
          <span className="text-zinc-300">Wire the microphone audio stream and handle </span>
          <span className="text-sky-300 font-medium">recognizing</span>
          <span className="text-zinc-300"> / </span>
          <span className="text-sky-300 font-medium">recognized</span>
          <span className="text-zinc-300"> text callbacks</span>
        </p>
        <p className="text-zinc-400 pt-0.5">
          <span>Refer to the official API docs: </span>
          <span className="text-sky-400 underline underline-offset-2 decoration-sky-400/40">https://github.com/FireTable/stream-asr#readme</span>
        </p>
      </div>
    );
  }

  return (
    <div className="font-mono text-xs sm:text-sm leading-normal sm:leading-snug select-all text-zinc-200 space-y-2">
      <p className="text-zinc-300">
        请在当前项目中集成 <span className="text-sky-400 font-semibold">@firetable/stream-asr</span> 端侧流式语音识别：
      </p>
      <p>
        <span className="text-zinc-500 font-bold">1. </span>
        <span className="text-zinc-300">根据本项目包管理器（npm / pnpm / yarn / bun）安装 </span>
        <span className="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 font-semibold">@firetable/stream-asr</span>
      </p>
      <p>
        <span className="text-zinc-500 font-bold">2. </span>
        <span className="text-zinc-300">初始化 </span>
        <span className="text-amber-300 font-semibold">StreamRecognizer</span>
        <span className="text-zinc-300"> 实例（采用 </span>
        <span className="text-purple-300 font-medium">Mode 3</span>
        <span className="text-zinc-300"> 通用流式模式，启用神经网络 VAD）</span>
      </p>
      <p>
        <span className="text-zinc-500 font-bold">3. </span>
        <span className="text-zinc-300">接入麦克风音频流并监听 </span>
        <span className="text-sky-300 font-medium">recognizing</span>
        <span className="text-zinc-300"> / </span>
        <span className="text-sky-300 font-medium">recognized</span>
        <span className="text-zinc-300"> 实时文本回调</span>
      </p>
      <p className="text-zinc-400 pt-0.5">
        <span>参考官方文档与示例：</span>
        <span className="text-sky-400 underline underline-offset-2 decoration-sky-400/40">https://github.com/FireTable/stream-asr#readme</span>
      </p>
    </div>
  );
};

export default function CTA() {
  const [lang, setLang] = useState<Lang>(getInitialLang);
  const [activeTab, setActiveTab] = useState<TabMode>('ai');
  const [copiedAi, setCopiedAi] = useState(false);
  const [copiedCli, setCopiedCli] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [pkg, setPkg] = useState<PkgManager>('pnpm');

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
  const c = t.cta || {};

  const cliCommands: Record<PkgManager, string> = {
    pnpm: 'pnpm add @firetable/stream-asr',
    npm: 'npm install @firetable/stream-asr',
    yarn: 'yarn add @firetable/stream-asr',
    bun: 'bun add @firetable/stream-asr'
  };

  const aiPromptText = c.aiPrompt || (
    lang === 'en'
      ? `Please integrate @firetable/stream-asr on-device streaming speech recognition into this project:\n\n1. Install @firetable/stream-asr using this project's package manager (npm / pnpm / yarn / bun)\n2. Create a StreamRecognizer instance using Mode 3 (Causal Streaming + Neural VAD)\n3. Wire the microphone audio stream and handle \`recognizing\` / \`recognized\` text callbacks\n\nRefer to the official API docs: https://github.com/FireTable/stream-asr#readme`
      : `请在当前项目中集成 @firetable/stream-asr 端侧流式语音识别：\n\n1. 根据本项目包管理器（npm / pnpm / yarn / bun）安装 @firetable/stream-asr\n2. 初始化 StreamRecognizer 实例（采用 Mode 3 通用流式模式，启用神经网络 VAD）\n3. 接入麦克风音频流并监听 recognizing / recognized 实时文本回调\n\n参考官方文档与示例：https://github.com/FireTable/stream-asr#readme`
  );

  const copyAiPrompt = async () => {
    try {
      await navigator.clipboard.writeText(aiPromptText);
      setCopiedAi(true);
      setTimeout(() => setCopiedAi(false), 2000);
    } catch {}
  };

  const copyCliCommand = async () => {
    try {
      await navigator.clipboard.writeText(cliCommands[pkg]);
      setCopiedCli(true);
      setTimeout(() => setCopiedCli(false), 2000);
    } catch {}
  };

  const copyExampleCode = async () => {
    try {
      await navigator.clipboard.writeText(RAW_EXAMPLE_CODE);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {}
  };

  const scrollToHero = (e: React.MouseEvent) => {
    e.preventDefault();
    const heroEl = document.getElementById('hero');
    if (heroEl) {
      heroEl.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section id="cta" className="w-full max-w-6xl px-4 sm:px-6 lg:px-8 pt-6 sm:pt-10 pb-16 sm:pb-24 scroll-mt-14 sm:scroll-mt-20">
      {/* =========================================================
          SECTION HEADER (STRICTLY IDENTICAL TO BENTOGRID TYPOGRAPHY SCALE)
          ========================================================= */}
      <div className="text-center mb-12 sm:mb-16">
        <h2 className="text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
          {c.title || '快速接入端侧语音识别'}
        </h2>
        <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 mt-3 max-w-2xl mx-auto leading-relaxed text-balance">
          {c.subtitle || '复制提示词交由 AI 自动配置，或通过包管理器手动安装。'}
        </p>
      </div>

      {/* =========================================================
          CONSOLE CARD (FULL MAX-W-6XL WIDTH MATCHING BENTO GRID)
          ========================================================= */}
      <SpotlightCard
        className="w-full p-5 sm:p-7 shadow-xl border border-zinc-200/90 dark:border-white/[0.08]"
        innerClassName="w-full flex flex-col"
        spotlightColor="rgba(56, 189, 248, 0.12)"
      >
        {/* Tab Switcher */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-200/80 dark:border-white/[0.08]">
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-zinc-100 dark:bg-black/50 border border-zinc-200/80 dark:border-white/[0.08]">
            {/* Tab 1: AI Prompt */}
            <button
              onClick={() => setActiveTab('ai')}
              className={`inline-flex items-center gap-2 px-3 sm:px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer ${
                activeTab === 'ai'
                  ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs border border-zinc-200/70 dark:border-white/10'
                  : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>{c.tabAi || '让 AI 接入'}</span>
            </button>

            {/* Tab 2: CLI */}
            <button
              onClick={() => setActiveTab('cli')}
              className={`inline-flex items-center gap-2 px-3 sm:px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all duration-150 cursor-pointer ${
                activeTab === 'cli'
                  ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs border border-zinc-200/70 dark:border-white/10'
                  : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              <Terminal className="w-3.5 h-3.5 shrink-0" />
              <span>{c.tabCli || '命令行安装'}</span>
            </button>
          </div>

          {/* Package Manager selector in CLI mode only */}
          {activeTab === 'cli' && (
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-zinc-100 dark:bg-black/50 border border-zinc-200/80 dark:border-white/[0.08] font-mono text-xs">
              {(['pnpm', 'npm', 'yarn', 'bun'] as PkgManager[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPkg(p)}
                  className={`px-2 py-0.5 rounded-md transition-all font-medium cursor-pointer ${
                    pkg === p
                      ? 'bg-sky-500 text-white shadow-xs font-semibold'
                      : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Tab 1: AI Prompt (Default) */}
        {activeTab === 'ai' && (
          <div className="pt-4 flex flex-col gap-4">
            <div className="relative rounded-xl bg-zinc-950 border border-zinc-800/80 p-5 sm:p-6 text-left overflow-hidden group">
              {/* Top-Right Copy Button (Pixel-perfect right-4 alignment) */}
              <CopyButton
                copied={copiedAi}
                onClick={copyAiPrompt}
                label={c.copy || '复制'}
                copiedLabel={c.copied || '已复制'}
                className="absolute top-4 right-4 z-10"
              />

              <div className="pr-20 sm:pr-24 overflow-x-auto">
                <HighlightedPrompt lang={lang} />
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: CLI Commands */}
        {activeTab === 'cli' && (
          <div className="pt-4 flex flex-col gap-4">
            {/* Command Box with Top-Right Copy Button */}
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800/80 font-mono text-xs sm:text-sm">
              <div className="flex items-center gap-2 overflow-x-auto pr-2">
                <span className="text-sky-400 select-none font-bold">$</span>
                <span className="text-zinc-100 font-medium select-all">
                  {cliCommands[pkg]}
                </span>
              </div>
              <CopyButton
                copied={copiedCli}
                onClick={copyCliCommand}
                label={c.copy || '复制'}
                copiedLabel={c.copied || '已复制'}
                className="shrink-0"
              />
            </div>

            {/* Example Code Box with Syntax Highlighting and Exactly Aligned Copy Button */}
            <div className="relative rounded-xl bg-zinc-950 border border-zinc-800/80 p-5 sm:p-6 text-left overflow-hidden group">
              {/* Top-Right Copy Button (Pixel-perfect right-4 alignment, identical to command box) */}
              <CopyButton
                copied={copiedCode}
                onClick={copyExampleCode}
                label={c.copy || '复制'}
                copiedLabel={c.copied || '已复制'}
                className="absolute top-4 right-4 z-10"
              />

              <div className="pr-20 sm:pr-24 overflow-x-auto">
                <HighlightedTypeScript />
              </div>
            </div>
          </div>
        )}

        {/* Card Footer: Clean navigation actions only */}
        <div className="mt-6 pt-4 border-t border-zinc-200/80 dark:border-white/[0.08] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/FireTable/stream-asr"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all active:scale-[0.98] bg-zinc-950 text-white hover:bg-zinc-800 shadow-xs dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100"
            >
              <svg className="w-3.5 h-3.5 fill-current shrink-0" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              <span>{c.primaryBtn || 'GitHub 仓库与文档'}</span>
              <ArrowUpRight className="w-3.5 h-3.5 opacity-70" />
            </a>

            <button
              onClick={scrollToHero}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all active:scale-[0.98] bg-zinc-100 hover:bg-zinc-200/80 text-zinc-700 border border-zinc-200/80 dark:bg-white/[0.06] dark:hover:bg-white/[0.12] dark:text-zinc-300 dark:border-white/10 cursor-pointer"
            >
              <ArrowUp className="w-3.5 h-3.5" />
              <span>{c.secondaryBtn || '回到顶部'}</span>
            </button>
          </div>
        </div>
      </SpotlightCard>
    </section>
  );
}
