import { useState, useEffect } from 'react';

interface GlitchTextProps {
  text: string;
  className?: string;
  as?: 'h1' | 'h2' | 'h3' | 'span';
}

export default function GlitchText({ text, className = '', as: Tag = 'h1' }: GlitchTextProps) {
  const [glitching, setGlitching] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setGlitching(true);
      setTimeout(() => setGlitching(false), 200);
    }, 4000 + Math.random() * 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Tag className={`relative inline-block ${className}`}>
      <span className="relative z-10">{text}</span>
      {glitching && (
        <>
          <span aria-hidden className="absolute inset-0 z-0 text-cyan-400 opacity-70"
            style={{ clipPath: 'inset(0 0 60% 0)', transform: 'translate(-2px, 1px)' }}>{text}</span>
          <span aria-hidden className="absolute inset-0 z-0 text-pink-400 opacity-70"
            style={{ clipPath: 'inset(55% 0 0 0)', transform: 'translate(2px, -1px)' }}>{text}</span>
        </>
      )}
    </Tag>
  );
}