import React, { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    // Read the actual active class applied to html
    const isDark = document.documentElement.classList.contains('dark');
    setTheme(isDark ? 'dark' : 'light');
  }, []);

  const toggle = () => {
    const isCurrentlyDark = document.documentElement.classList.contains('dark');
    const nextTheme = isCurrentlyDark ? 'light' : 'dark';

    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
      localStorage.setItem('theme', 'dark');
      setTheme('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.colorScheme = 'light';
      localStorage.setItem('theme', 'light');
      setTheme('light');
    }
    window.dispatchEvent(new CustomEvent('stream_asr_theme_change', { detail: nextTheme }));
  };

  return (
    <button
      onClick={toggle}
      className="p-2 rounded-full text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/[0.05] transition-colors focus:outline-none flex items-center justify-center shrink-0"
      title="Toggle Theme"
      aria-label="Toggle Theme"
    >
      {theme === 'dark' ? <Sun className="w-4 h-4 text-current" /> : <Moon className="w-4 h-4 text-current" />}
    </button>
  );
}