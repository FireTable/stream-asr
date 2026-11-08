import React, { useEffect, useState } from 'react';

interface BlurTextProps {
  text: string;
  delay?: number;
  className?: string;
  animateBy?: 'words' | 'letters';
  direction?: 'top' | 'bottom';
}

export default function BlurText({
  text,
  delay = 45,
  className = '',
  animateBy = 'words',
  direction = 'top'
}: BlurTextProps) {
  const elements = animateBy === 'words' ? text.split(' ') : text.split('');
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setInView(true), 60);
    return () => clearTimeout(timer);
  }, []);

  return (
    <span className={`inline-flex flex-wrap items-center justify-center ${className}`}>
      {elements.map((segment, index) => (
        <span
          key={index}
          className="inline-block transition-all duration-700 ease-out"
          style={{
            filter: inView ? 'blur(0px)' : 'blur(10px)',
            opacity: inView ? 1 : 0,
            transform: inView
              ? 'translateY(0)'
              : direction === 'top'
              ? 'translateY(-10px)'
              : 'translateY(10px)',
            transitionDelay: `${index * delay}ms`,
            marginRight: animateBy === 'words' ? '0.2em' : '0em',
          }}
        >
          {segment === ' ' ? '\u00A0' : segment}
        </span>
      ))}
    </span>
  );
}
