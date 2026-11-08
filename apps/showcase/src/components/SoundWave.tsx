import React, { useEffect, useRef } from 'react';

interface SoundWaveProps {
  isActive: boolean;
  audioLevel?: number; // 0.0 to 1.0
  className?: string;
}

export default function SoundWave({ isActive, audioLevel = 0, className = '' }: SoundWaveProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let phase = 0;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const numBars = 36;
      const barWidth = Math.max(3, (width / numBars) - 3);
      const centerY = height / 2;

      for (let i = 0; i < numBars; i++) {
        const x = i * (barWidth + 3) + 2;
        let barHeight = 4;

        if (isActive) {
          // Dynamic organic sine-wave + audio level modulation
          const sinFactor = Math.sin(phase + (i * 0.25)) * 0.5 + 0.5;
          const levelMultiplier = Math.max(0.2, audioLevel);
          barHeight = 6 + (height * 0.7) * sinFactor * levelMultiplier;
        } else {
          barHeight = 4 + Math.sin(phase * 0.5 + i * 0.2) * 2;
        }

        const y = centerY - barHeight / 2;
        const radius = barWidth / 2;

        // Gradient from electric sky blue to deep cyan
        const grad = ctx.createLinearGradient(0, y, 0, y + barHeight);
        if (isActive) {
          grad.addColorStop(0, '#38bdf8');
          grad.addColorStop(1, '#0284c7');
        } else {
          grad.addColorStop(0, 'rgba(56, 189, 248, 0.25)');
          grad.addColorStop(1, 'rgba(148, 163, 184, 0.15)');
        }

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, radius);
        ctx.fill();
      }

      phase += isActive ? 0.12 : 0.03;
      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [isActive, audioLevel]);

  return (
    <div className={`relative w-full flex items-center justify-center ${className}`}>
      <canvas
        ref={canvasRef}
        width={320}
        height={64}
        className="w-full max-w-xs h-16 pointer-events-none"
      />
    </div>
  );
}
