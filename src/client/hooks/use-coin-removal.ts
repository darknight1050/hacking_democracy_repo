'use client';
import { useState } from 'react';

/** Only accepted decreases animate; rejected requests and initial loads do not. */
export function useCoinRemoval(coins: number) {
  const [observed, setObserved] = useState(coins);
  const [departingFrom, setDepartingFrom] = useState<number | null>(null);
  if (observed !== coins) {
    setObserved(coins);
    setDepartingFrom(coins < observed ? observed : null);
  }
  return { departingFrom, finish: () => setDepartingFrom(null) };
}
