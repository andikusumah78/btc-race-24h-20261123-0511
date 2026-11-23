// Peak-guard EMA rider for the cbBTC 24h race (agent-fun/bars-replay/v1).
//
// Idea, in one paragraph: BTC trends in bursts and chops in between, and a
// full-size round trip costs about 26 bps in fees, slippage and impact, so
// this bot only trades when the short trend has clearly turned. It rides an
// EMA(5)-over-EMA(21) uptrend with all of its cash, trails a 2% stop under
// the highest close seen while long, and after being stopped out it refuses
// to chase the next bounce: it only re-enters on a fresh cross AND after the
// close has reclaimed the peak it was stopped out from. That last rule is
// what keeps it in cash through a falling market instead of buying every
// dead-cat bounce. One asset (CBBTC), long only, no leverage, no clock, no
// network, no randomness: every decision is a pure function of the bars the
// hello/batch stream has delivered so far.
//
// Fills land at the next bar's open, so an order decided on this batch's
// close can be rejected for slippage (or for any other market reason) and
// the position then still stands on the next batch. The bot therefore keeps
// a buyArmed latch: once a cross fires it stays willing to buy while the
// fast EMA stays above the slow one, so a rejected buy is simply re-sent on
// the next bar instead of being lost. A rejected sell needs no latch: the
// trailing-stop condition is re-checked from the live peak every bar, so it
// fires again until the fill lands.

import { runBars } from "./vendor/makefun-bars.ts";
import type { BarsState, Batch } from "./vendor/makefun-bars.ts";

const SYMBOL = "CBBTC";

// Trend lengths, in one-minute bars.
const FAST_LEN = 5;
const SLOW_LEN = 21;
// Trailing stop: sell everything once the close falls this far under the
// highest close seen while long (200 bps = 2%).
const STOP_BPS = 200;
// The most an order may fill away from the latest close (500 bps = 5%):
// far above the ~9 bps a full-size fill normally moves, so a rejection here
// means the market genuinely jumped, and the latch retries next bar.
const MAX_SLIPPAGE_BPS = 500;

interface Rider {
  priceScale: number;
  fast: number | null;
  slow: number | null;
  prevFast: number | null;
  prevSlow: number | null;
  // Highest close seen since the current long began (0 while flat).
  peakClose: number;
  // Highest close seen before the last stop-out; a re-entry must close
  // above it (0 = never stopped out, so the first entry is unrestricted).
  exitPeak: number;
  entries: number;
  buyArmed: boolean;
}

function emaStep(prev: number | null, price: number, len: number): number {
  if (prev === null) return price;
  const k = 2 / (len + 1);
  return price * k + prev * (1 - k);
}

const rider: Rider = {
  priceScale: 5,
  fast: null,
  slow: null,
  prevFast: null,
  prevSlow: null,
  peakClose: 0,
  exitPeak: 0,
  entries: 0,
  buyArmed: false,
};

await runBars({
  onHello(state: BarsState): void {
    const sym = state.symbols.get(SYMBOL);
    if (sym !== undefined) rider.priceScale = sym.price_scale;
  },

  onBatch(state: BarsState, batch: Batch) {
    // No fresh bar for our symbol this minute: nothing new to learn, and
    // no decision to make. (A gap minute still gets its empty reply.)
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return [];

    const close = Number(BigInt(bar.c)) / 10 ** rider.priceScale;

    // Fold this close into both trend averages, remembering yesterday's
    // values so a cross can be spotted below.
    rider.prevFast = rider.fast;
    rider.prevSlow = rider.slow;
    rider.fast = emaStep(rider.fast, close, FAST_LEN);
    rider.slow = emaStep(rider.slow, close, SLOW_LEN);

    // Warm-up bars build history only: orders decided on them are refused.
    if (state.warmingUp) return [];

    const held = state.positions.get(SYMBOL);
    const qty = held === undefined ? 0n : held.qty;

    if (qty > 0n) {
      // Long: trail the stop under the best close since entry.
      if (close > rider.peakClose) rider.peakClose = close;
      const stopPrice = (rider.peakClose * (10_000 - STOP_BPS)) / 10_000;
      if (close < stopPrice) {
        rider.exitPeak = rider.peakClose;
        rider.peakClose = 0;
        rider.buyArmed = false;
        return [{ side: "sell", symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    // Flat: arm on a fresh upward cross, disarm when the trend turns back.
    rider.peakClose = 0;
    if (
      rider.prevFast !== null &&
      rider.prevSlow !== null &&
      rider.prevFast <= rider.prevSlow &&
      rider.fast > rider.slow
    ) {
      rider.buyArmed = true;
    }
    if (rider.fast !== null && rider.slow !== null && rider.fast <= rider.slow) {
      rider.buyArmed = false;
    }

    if (!rider.buyArmed) return [];

    // After a stop-out, only buy back once the market has reclaimed the
    // peak it fell from; the first entry of the run has no such hurdle.
    const reclaimed = rider.entries === 0 || close > rider.exitPeak;
    if (!reclaimed) return [];
    if (state.cash < 1_000_000n) return [];

    rider.entries += 1;
    // buyArmed stays set until the fill lands (the next batch then shows
    // the position) or the fast average turns back under the slow one: a
    // buy this bar rejects is simply re-sent on the next bar.
    rider.peakClose = close;
    return [{ side: "buy", symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
  },
});
