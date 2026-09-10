'use client';
import Image from 'next/image';
import { useState, type CSSProperties } from 'react';
import type { Suggestion } from '@/contracts';
import { ProjectCard } from './project-card';

/** Each vote adds a pyramid row of 1, 3, 5, … coins, preserving quadratic cost. */
export function CoinProject({
  suggestion,
  coins,
  confirmed = 0,
  canAdd,
  busy,
  onChange,
}: {
  suggestion: Suggestion;
  coins: number;
  confirmed?: number;
  canAdd: boolean;
  busy: boolean;
  onChange: (coins: number) => void;
}) {
  const [observedCoins, setObservedCoins] = useState(coins);
  const [departingFrom, setDepartingFrom] = useState<number | null>(null);
  // Animate only an accepted balance change, never an unconfirmed request or failed removal.
  if (observedCoins !== coins) {
    setObservedCoins(coins);
    setDepartingFrom(coins < observedCoins ? observedCoins : null);
  }
  const levels = Math.max(1, Math.ceil(Math.sqrt(Math.max(coins, departingFrom ?? 0))));
  const votes = Math.sqrt(coins);
  const next = Math.floor(votes) + 1;
  const previousCoins = Math.max(confirmed, Math.max(0, Math.ceil(votes) - 1) ** 2);
  const totalId = `coin-total-${suggestion.id}`;
  return (
    <div className={`coin-project ${canAdd ? 'can-add' : ''}`}>
      <ProjectCard mobileInline suggestion={suggestion}>
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

          <button
            type="button"
            className="remove-coin"
            aria-label={`Remove 1 vote from ${suggestion.title}`}
            aria-disabled={busy || coins <= confirmed}
            onClick={() => {
              if (!busy && coins > confirmed) onChange(previousCoins);
            }}
          >
            <span>Remove 1 vote</span>
            <small>Return {coins - previousCoins} coins</small>
          </button>
          <button
            className="coin-add-area"
            type="button"
            aria-label={`Add coins for the next vote to ${suggestion.title}`}
            aria-describedby={totalId}
            aria-disabled={busy || !canAdd}
            onClick={() => {
              if (!busy && canAdd) onChange(next * next);
            }}
          >
            {confirmed > 0 && <small>{confirmed} confirmed coins · locked</small>}
            <div className="coin-hint">
              <span>
                {coins === 0
                  ? 'Tap here to add your first coin'
                  : `Tap to add ${next * next - coins} coins → ${next} votes`}
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
                    const index = row * row + column;
                    const filled = index < coins;
                    const departing = index >= coins && index < (departingFrom ?? 0);
                    return (
                      <span
                        className={`coin-slot ${filled || departing ? 'filled' : ''}`}
                        style={{ gridColumn: levels - row + column }}
                        key={column}
                      >
                        {departing ? (
                          <span
                            className="coin-burst"
                            style={{ animationDelay: `${column * 35}ms` }}
                            onAnimationEnd={(event) => {
                              if (
                                event.target === event.currentTarget &&
                                index === (departingFrom ?? 0) - 1
                              )
                                setDepartingFrom(null);
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
                        ) : (
                          filled && (
                            <Image
                              className="deposited-coin"
                              style={{ animationDelay: `${column * 25}ms` }}
                              src="/coin.svg"
                              alt=""
                              width={40}
                              height={40}
                              draggable={false}
                            />
                          )
                        )}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          </button>
        </div>
      </ProjectCard>
    </div>
  );
}
