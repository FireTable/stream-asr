import React, { useRef } from 'react';

interface SpotlightCardProps extends React.HTMLAttributes<HTMLDivElement> {
  spotlightColor?: string;
  className?: string;
  innerClassName?: string;
  children: React.ReactNode;
}

export default function SpotlightCard({
  spotlightColor = 'rgba(56, 189, 248, 0.12)',
  className = '',
  innerClassName = 'h-full flex flex-col',
  children,
  ...props
}: SpotlightCardProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const spotlightRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!divRef.current || !spotlightRef.current) return;
    const rect = divRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    spotlightRef.current.style.background = `radial-gradient(550px circle at ${x}px ${y}px, ${spotlightColor}, transparent 45%)`;
  };

  const handleMouseEnter = () => {
    if (spotlightRef.current) {
      spotlightRef.current.style.opacity = '1';
    }
  };

  const handleMouseLeave = () => {
    if (spotlightRef.current) {
      spotlightRef.current.style.opacity = '0';
    }
  };

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative overflow-hidden rounded-3xl border border-zinc-200/80 dark:border-white/[0.08] bg-white/70 dark:bg-[#0c0d10]/80 backdrop-blur-xl transition-all duration-300 ${className}`}
      {...props}
    >
      {/* Dynamic Cursor Spotlight Overlay - Directly mutated via ref to eliminate 100% of React re-renders */}
      <div
        ref={spotlightRef}
        className="pointer-events-none absolute -inset-px transition-opacity duration-300 z-0 opacity-0"
        aria-hidden="true"
      />
      <div className={`relative z-10 ${innerClassName}`}>
        {children}
      </div>
    </div>
  );
}
