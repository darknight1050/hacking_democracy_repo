'use client';
import { useState } from 'react';

/** Only accepted decreases animate; rejected requests and initial loads do not. */
export function useCoinRemoval(coins: number, enabled = true) {
  const [observed, setObserved] = useState(coins);
  const [departingFrom, setDepartingFrom] = useState<number | null>(null);
  if (observed !== coins) {
    setObserved(coins);
    setDepartingFrom(enabled && coins < observed ? observed : null);
  }
  return { departingFrom: enabled ? departingFrom : null, finish: () => setDepartingFrom(null) };
}
