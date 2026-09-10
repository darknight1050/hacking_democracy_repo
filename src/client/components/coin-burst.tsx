'use client';
import Image from 'next/image';
import type { CSSProperties } from 'react';

/** Shared removal effect for mobile and desktop proposal cards. */
export function CoinBurst({ delay = 0, onFinish }: { delay?: number; onFinish?: () => void }) {
  return (
    <span
      className="coin-burst"
      aria-hidden="true"
      style={{ animationDelay: `${delay}ms` }}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget) onFinish?.();
      }}
    >
      <Image
        className="breaking-coin"
        src="/coin.svg"
        alt=""
        width={40}
        height={40}
        draggable={false}
      />
      {Array.from({ length: 6 }, (_, piece) => (
        <i
          key={piece}
          style={
            {
              '--fragment-x': `${Math.cos((piece * Math.PI) / 3) * 35}px`,
              '--fragment-y': `${Math.sin((piece * Math.PI) / 3) * 35}px`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}
