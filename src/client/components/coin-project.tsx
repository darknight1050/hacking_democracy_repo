'use client';
import Image from 'next/image';
import type { CSSProperties } from 'react';
import type { Suggestion } from '@/contracts';
import { ProjectCard } from './project-card';

/** Each vote adds a pyramid row of 1, 3, 5, … coins, preserving quadratic cost. */
export function CoinProject({
  suggestion,
  coins,
  canAdd,
  busy,
  onChange,
}: {
  suggestion: Suggestion;
  coins: number;
  canAdd: boolean;
  busy: boolean;
  onChange: (coins: number) => void;
}) {
  const levels = Math.max(1, Math.ceil(Math.sqrt(coins)));
  const votes = Math.sqrt(coins);
  const next = Math.floor(votes) + 1;
  const previousCoins = Math.max(0, Math.ceil(votes) - 1) ** 2;
  const totalId = `coin-total-${suggestion.id}`;
  return (
    <div className={`coin-project ${canAdd ? 'can-add' : ''}`}>
      <ProjectCard suggestion={suggestion}>
        <button
          className="coin-hit-area"
          type="button"
          aria-label={`Add coins for the next vote to ${suggestion.title}`}
          aria-describedby={totalId}
          disabled={busy || !canAdd}
          onClick={() => onChange(next * next)}
        />
        <div className="coin-allocation">
          <div className="coin-totals" id={totalId} aria-live="polite" aria-atomic="true">
            <span>
              <strong>{coins}</strong> {coins === 1 ? 'coin' : 'coins'}
            </span>
            <span aria-hidden="true">→</span>
            <span>
              <strong>{Number.isInteger(votes) ? votes : votes.toFixed(2)}</strong>{' '}
              {votes === 1 ? 'vote' : 'votes'}
            </span>
          </div>
          <div
            className="coin-pyramid"
            style={{ '--coin-columns': levels * 2 - 1 } as CSSProperties}
            aria-hidden="true"
          >
            {Array.from({ length: levels }, (_, row) => (
              <div className="coin-pyramid-row" key={row}>
                {Array.from({ length: row * 2 + 1 }, (_, column) => {
                  const filled = row * row + column < coins;
                  return (
                    <span
                      className={`coin-slot ${filled ? 'filled' : ''}`}
                      style={{ gridColumn: levels - row + column }}
                      key={column}
                    >
                      {filled && (
                        <Image
                          className="deposited-coin"
                          style={{ animationDelay: `${column * 25}ms` }}
                          src="/coin.svg"
                          alt=""
                          width={40}
                          height={40}
                          draggable={false}
                        />
                      )}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="coin-hint">
            <span>
              {coins === 0
                ? 'Tap anywhere to add your first coin'
                : `Tap to add ${next * next - coins} coins → ${next} votes`}
            </span>
            <button
              type="button"
              className="remove-coin"
              aria-label={`Remove 1 vote from ${suggestion.title}`}
              disabled={busy || coins === 0}
              onClick={() => onChange(previousCoins)}
            >
              <span>Remove 1 vote</span>
              <small>Return {coins - previousCoins} coins</small>
            </button>
          </div>
        </div>
      </ProjectCard>
    </div>
  );
}
