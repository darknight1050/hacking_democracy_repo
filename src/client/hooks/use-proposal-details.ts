'use client';
import { useEffect, useRef, useState, type PointerEvent, type MouseEvent } from 'react';

/** A stationary hold opens details; scrolling, swiping and control presses do not. */
export function useProposalDetails() {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const held = useRef(false);
  function cancel() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  }
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return {
    open,
    show: () => {
      cancel();
      setOpen(true);
    },
    close: () => setOpen(false),
    handlers: {
      onPointerDownCapture(event: PointerEvent<HTMLElement>) {
        cancel();
        if (open) return;
        held.current = false;
        const target = event.target as HTMLElement;
        if (
          !event.isPrimary ||
          event.button !== 0 ||
          (target.closest('button, a, input, select, textarea, label') &&
            !target.closest('.coin-add-area'))
        )
          return;
        start.current = { x: event.clientX, y: event.clientY };
        timer.current = setTimeout(() => {
          held.current = true;
          cancel();
          window.getSelection()?.removeAllRanges();
          setOpen(true);
        }, 600);
      },
      onPointerMoveCapture(event: PointerEvent<HTMLElement>) {
        if (
          start.current &&
          Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > 12
        )
          cancel();
      },
      onPointerUpCapture: cancel,
      onPointerCancelCapture: cancel,
      onPointerLeave: cancel,
      onClickCapture(event: MouseEvent<HTMLElement>) {
        if (held.current && !(event.target as HTMLElement).closest('dialog')) {
          // Consume the click generated when the long press is released: never spend coins.
          event.preventDefault();
          event.stopPropagation();
          held.current = false;
        }
      },
      onContextMenu(event: MouseEvent<HTMLElement>) {
        if (!(event.target as HTMLElement).closest('dialog')) event.preventDefault();
      },
    },
  };
}
