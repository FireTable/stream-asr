import React, { useState, useEffect } from 'react';
import Particles from './Particles';

export default function ParticlesBackground() {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    // Check initial dark mode state
    const checkDark = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };

    checkDark();

    // Observe theme toggle class changes on <html>
    const observer = new MutationObserver(checkDark);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {/* 100% CSS Deep Space Ambient Mesh (Zero blur overhead) */}
      <div 
        aria-hidden="true" 
        className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_20%,rgba(56,189,248,0.10),transparent_75%)] dark:bg-[radial-gradient(ellipse_80%_60%_at_50%_20%,rgba(14,165,233,0.12),transparent_75%)] pointer-events-none" 
      />

      <Particles
        particleCount={140}
        particleSpread={12}
        speed={0.10}
        particleColors={
          isDark
            ? ['#ffffff', '#38bdf8', '#7dd3fc', '#bae6fd']
            : ['#0284c7', '#0369a1', '#0ea5e9', '#38bdf8']
        }
        moveParticlesOnHover={true}
        particleHoverFactor={1.0}
        hoverRadius={150}
        hoverEffect="parallax"
        particleBaseSize={110}
        sizeRandomness={0.8}
        cameraDistance={22}
        glow={0.6}
        twinkle={0.4}
        depthOfField={0.2}
        clickBurst={true}
        opacity={isDark ? 0.85 : 0.70}
        lightMode={!isDark}
      />
    </div>
  );
}
