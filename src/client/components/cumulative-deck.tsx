'use client';
import { useEffect, useState } from 'react';
import { Search, Shuffle, ShoppingBasket } from 'lucide-react';
import type {
  Ballot,
  CumulativeCart,
  CumulativeCheckout,
  FundedProject,
  ParticipationOptions,
  Suggestion,
} from '@/contracts';
import { api } from '@/client/api';
import { CoinProject } from './coin-project';
import { RandomProposalFeed } from './random-proposal-feed';
import { CumulativeSummary } from './cumulative-summary';
import { SuggestionBrowser } from './suggestion-browser';
import { FundingReview } from './funding-review';
import { ConfirmedAchievements } from './achievement-collection';
type Mode = 'random' | 'catalog' | 'checkout' | 'confirmed';
const json = (body: unknown) => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

/** One server-owned basket spans discovery screens; only checkout changes confirmed votes. */
export function CumulativeDeck({
  ballot: initialBallot,
  onSubmitted,
}: {
  ballot: Ballot;
  onSubmitted: () => Promise<void>;
}) {
  const [ballot, setBallot] = useState(initialBallot);
  const [cart, setCart] = useState<CumulativeCart | null>(null);
  const [mode, setMode] = useState<Mode>('random');
  const [options, setOptions] = useState<ParticipationOptions | null>(null);
  const [projects, setProjects] = useState<FundedProject[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void api<CumulativeCart>('/api/cumulative/cart', { signal: controller.signal })
      .then((next) => {
        if (!controller.signal.aborted) {
          setCart(next);
          setError('');
          setBusy(false);
          if (next.checkoutRevision >= 0) setMode('confirmed');
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e.message);
          setBusy(false);
        }
      });
    return () => controller.abort();
  }, [attempt]);
  const coins = cart?.coins ?? {};
  const spent = Object.values(coins).reduce((sum, n) => sum + n, 0);
  const remaining = 100 - spent;
  const funded = Object.keys(coins).length;
  const confirmed = cart?.confirmed ?? {};
  const locked = Object.values(confirmed).reduce((sum, amount) => sum + amount, 0);
  async function change(id: string, amount: number, source: 'random' | 'catalog' | 'checkout') {
    if (!cart || busy) return;
    setBusy(true);
    setError('');
    try {
      setCart(
        await api<CumulativeCart>('/api/cumulative/cart', {
          method: 'PATCH',
          ...json({ revision: cart.revision, suggestionId: id, coins: amount, source }),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
      // A failed response may have committed. Reload the authoritative balance before any next action.
      try {
        if (mode === 'checkout') {
          const review = await api<CumulativeCheckout>('/api/cumulative/checkout');
          setCart(review.cart);
          setProjects(review.projects);
        } else setCart(await api<CumulativeCart>('/api/cumulative/cart'));
      } catch {
        setCart(null);
      }
    } finally {
      setBusy(false);
    }
  }
  async function navigate(next: Mode) {
    setBusy(true);
    setError('');
    try {
      if (next === 'catalog' && !options)
        setOptions(await api<ParticipationOptions>('/api/options'));
      if (next === 'checkout') {
        const review = await api<CumulativeCheckout>('/api/cumulative/checkout');
        setCart(review.cart);
        setProjects(review.projects);
      }
      if (next === 'random' && ballot.finished && remaining > 0)
        setBallot(await api<Ballot>('/api/ballots/next', { method: 'POST' }));
      setMode(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!cart) return;
    setBusy(true);
    setError('');
    try {
      setCart(
        await api<CumulativeCart>('/api/cumulative/checkout', {
          method: 'POST',
          ...json({ revision: cart.revision }),
        }),
      );
      setMode('confirmed');
      await onSubmitted();
    } catch (e) {
      setError((e as Error).message);
      try {
        const review = await api<CumulativeCheckout>('/api/cumulative/checkout');
        setCart(review.cart);
        setProjects(review.projects);
      } catch {
        /* Phase closure is handled by the surrounding app. */
      }
    } finally {
      setBusy(false);
    }
  }
  function card(s: Suggestion, source: 'random' | 'catalog') {
    const amount = coins[s.id] ?? 0;
    return (
      <CoinProject
        suggestion={s}
        coins={amount}
        confirmed={confirmed[s.id] ?? 0}
        busy={busy || !cart}
        canAdd={(Math.floor(Math.sqrt(amount)) + 1) ** 2 - amount <= remaining}
        onChange={(amount) => void change(s.id, amount, source)}
      />
    );
  }
  if (cart && cart.checkoutRevision >= 0 && locked === 100)
    return (
      <section className="empty">
        <h2>{spent === 100 ? 'All 100 coins put to work.' : 'Your funding is confirmed.'}</h2>
        <p>Your votes are final and cannot be changed. Thank you for participating.</p>
        <CumulativeSummary />
        <ConfirmedAchievements />
      </section>
    );
  return (
    <>
      <div className="discovery-banner">
        {mode === 'random' ? (
          <>
            <span>Looking for a specific proposal?</span>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => void navigate('catalog')}
            >
              <Search size={18} /> Search catalog
            </button>
          </>
        ) : (
          <>
            <span>Discover something unexpected.</span>
            <button className="text-button" disabled={busy} onClick={() => void navigate('random')}>
              <Shuffle size={18} /> Back to random samples
            </button>
            {mode !== 'catalog' && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => void navigate('catalog')}
              >
                Search catalog
              </button>
            )}
          </>
        )}
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
          <button
            onClick={() =>
              mode === 'checkout' ? void navigate('checkout') : setAttempt((n) => n + 1)
            }
          >
            Reload basket
          </button>
        </p>
      )}
      {!cart ? (
        <p role="status">
          {error ? 'Reload your basket to continue safely.' : 'Loading your coin basket…'}
        </p>
      ) : (
        <>
          <div className="cumulative-wallet" aria-live="polite">
            <div>
              <span className="wallet-heading">Your 100-coin budget</span>
              <strong>
                {remaining} <small>coins left</small>
              </strong>
            </div>
            <div className="wallet-breakdown">
              <small>
                {locked} confirmed coins locked · {spent - locked} draft coins
              </small>
              <b>{spent} coins</b> across {funded} {funded === 1 ? 'project' : 'projects'}
              <small>
                {cart.checkoutRevision === cart.revision
                  ? 'Allocation confirmed'
                  : 'Draft saved · confirm at checkout'}
              </small>
            </div>
            <progress aria-label="Coins remaining in your basket" max={100} value={remaining} />
            <button
              className="primary overview-action"
              disabled={
                busy ||
                (mode === 'checkout' &&
                  (spent <= locked ||
                    projects.some((p) => !p.available && coins[p.id] > (confirmed[p.id] ?? 0))))
              }
              onClick={() => (mode === 'checkout' ? void confirm() : void navigate('checkout'))}
            >
              <ShoppingBasket size={18} />{' '}
              {mode === 'checkout' ? 'Confirm funding' : 'Overview & confirm'}
            </button>
          </div>
          {mode === 'confirmed' && (
            <section className="empty">
              <h2>Your votes are confirmed.</h2>
              <p>
                {locked} coins are locked. You still have {remaining} coins to spend.
              </p>
              <button className="primary" disabled={busy} onClick={() => void navigate('random')}>
                Continue voting
              </button>
              <CumulativeSummary />
              <ConfirmedAchievements />
            </section>
          )}
          {mode === 'random' && (
            <>
              <div className="ballot-heading">
                <div>
                  <h2>Cumulative Voting</h2>
                  <p>
                    Tap a project to add one vote. Each pyramid level is one vote, with 1, 4, 9…
                    coins for 1, 2, 3… votes.
                  </p>
                  <p>
                    Your basket follows you through random samples and the catalog. Confirm it when
                    you’re ready.
                  </p>
                  <small>
                    Random samples use your selected districts plus two City-wide ideas when
                    available. Projects never repeat in new random batches.
                  </small>
                </div>
              </div>
            </>
          )}
          <RandomProposalFeed
            key={ballot.id || ballot.finished}
            initial={ballot}
            active={mode === 'random'}
            remaining={remaining}
            busy={busy}
            onReview={() => void navigate('checkout')}
            onSearch={() => void navigate('catalog')}
            renderProject={(suggestion) => card(suggestion, 'random')}
          />
          {options && (
            <div hidden={mode !== 'catalog'}>
              <SuggestionBrowser
                trackViews
                options={options}
                revision={0}
                renderProject={(s) => card(s, 'catalog')}
              />
            </div>
          )}
          {mode === 'checkout' && (
            <section className="checkout-panel" aria-label="Funding checkout">
              <h2>Your funding basket</h2>
              <p>
                All your projects, across random samples and catalog picks. Remove a vote to return
                coins, then add a vote to another project. Changes stay in your basket until you
                confirm.
              </p>
              <FundingReview
                projects={projects}
                coins={coins}
                confirmed={confirmed}
                remaining={remaining}
                busy={busy}
                onChange={(id, amount) => void change(id, amount, 'checkout')}
              />
              {!funded && (
                <p>Your basket is empty. Find a project in the catalog or random samples.</p>
              )}
              <div className="vote-footer">
                <span>
                  {spent} coins allocated · {remaining} left
                  <small>
                    Confirmed coins stay locked. Unspent coins remain available for later votes.
                  </small>
                </span>
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
