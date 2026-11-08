import React, { useState, useEffect, useRef } from 'react';
import { Globe, Check } from 'lucide-react';
import { translations, getInitialLang, type Lang } from '../i18n/translations';

interface LanguageOption {
  code: Lang;
  label: string;
  flag: string;
}

const LANGUAGES: LanguageOption[] = [
  { code: 'zh-cn', label: '简体中文', flag: '🇨🇳' },
  { code: 'zh-hk', label: '繁體中文', flag: '🇭🇰' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
];

export default function LangDropdown() {
  const [currentLang, setCurrentLang] = useState<Lang>(getInitialLang);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const initial = getInitialLang();
    setCurrentLang(initial);
    applyTranslations(initial);
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const selectLanguage = (code: Lang) => {
    setCurrentLang(code);
    setIsOpen(false);
    localStorage.setItem('stream_asr_lang', code);
    document.documentElement.lang = code;
    window.dispatchEvent(new CustomEvent('stream_asr_lang_change', { detail: code }));
    applyTranslations(code);
  };

  const applyTranslations = (lang: Lang) => {
    const dict = (translations[lang] || translations['zh-cn']) as any;
    document.documentElement.lang = lang;
    if (dict.meta?.title) document.title = dict.meta.title;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc && dict.meta?.desc) metaDesc.setAttribute('content', dict.meta.desc);
    const elements = document.querySelectorAll<HTMLElement>('[data-i18n]');
    elements.forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (!key) return;
      const parts = key.split('.');
      let val: any = dict;
      for (const p of parts) {
        if (val && typeof val === 'object' && p in val) {
          val = val[p];
        } else {
          val = null;
          break;
        }
      }
      if (typeof val === 'string') {
        el.innerText = val;
      }
    });
  };

  const currentOption = LANGUAGES.find(l => l.code === currentLang) || LANGUAGES[0];

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-full text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/[0.05] transition-colors focus:outline-none shrink-0 flex items-center justify-center"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label="Select Language"
        title={currentOption.label}
      >
        <Globe className="w-4 h-4 text-current" />
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-orientation="vertical"
          className="absolute right-0 mt-2 w-36 rounded-2xl border border-zinc-200/80 dark:border-white/[0.08] bg-white/95 dark:bg-[#0c0d12]/95 backdrop-blur-2xl shadow-xl dark:shadow-2xl p-1 z-50 animate-in fade-in-0 zoom-in-95 origin-top-right focus:outline-none"
        >
          {LANGUAGES.map((option) => {
            const isSelected = option.code === currentLang;
            return (
              <button
                key={option.code}
                role="menuitem"
                onClick={() => selectLanguage(option.code)}
                className={`w-full flex items-center justify-between px-3 py-1.5 text-xs rounded-xl font-medium transition-colors ${
                  isSelected
                    ? 'bg-zinc-100 text-zinc-900 dark:bg-white/[0.08] dark:text-white'
                    : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/80 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/[0.04]'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="text-sm leading-none">{option.flag}</span>
                  <span>{option.label}</span>
                </span>
                {isSelected && <Check className="w-3.5 h-3.5 text-current" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
