// Dip-buying BTC bot for btc-race-24h-20261118-1444 (bars-replay/v1).
//
// Strategy: wait for price to dip 120 bps or more below its trailing
// 120-bar peak, then buy the dip with all the cash. The dip is measured
// against the peak through the previous bar, and the entry fires on the
// first close that sits that far below it: requiring two closes below
// the peak plus a turn back up entered too late on this slow window
// (local grade v1 with that confirmation: +$10.61 on the new dev window;
// the sweep showed entering on the first deep close wins more of the
// bounce). A 240-bar trend gate blocks entries when the 240-bar return
// is worse than -100 bps, so the bot does not catch a falling knife in a
// steep downtrend. Every position exits in full on take-profit (+100 bps
// over the volume-weighted entry price) or stop-loss (-200 bps). The
// take-profit is 100, not 120: on this window the bounce after a 120 bps
// dip recovers about 90-100 bps before fading, so a 120 target strands
// the trade (local grade with TP 120: -$7.09) while 100 banks it.
// No top-ups while holding, no shorts, no leverage. All arithmetic is
// bigint; no clock, no randomness, no network.

import { runBars, type BarsState, type Batch, type OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const BPS = 10_000n;
const MAX_SLIP = 200;
const MIN_NOTIONAL = 1_000_000n;
const PEAK_BARS = 120;
const DIP_BPS = 120n;
const TAKE_PROFIT_BPS = 100n;
const STOP_LOSS_BPS = 200n;
const TREND_GATE_BPS = -100n;
const TREND_BARS = 240;

// Every close price seen, in bar order.
const closes: bigint[] = [];
let entryPrice: bigint | null = null;
let entryQty: bigint = 0n;

// Highest close in closes[j - n + 1 .. j], with the start clamped at 0.
function trailPeak(j: number, n: number): bigint {
  let start = j - n + 1;
  if (start < 0) start = 0;
  let best = closes[start];
  for (let i = start + 1; i <= j; i++) {
    if (closes[i] > best) best = closes[i];
  }
  return best;
}

// Return over the last 240 bars in bps, or null until 241 closes exist.
function r240(): bigint | null {
  const n = closes.length;
  if (n <= TREND_BARS) return null;
  return ((closes[n - 1] - closes[n - 1 - TREND_BARS]) * BPS) / closes[n - 1 - TREND_BARS];
}

// True when the latest close sits at least DIP_BPS below the trailing
// 120-bar peak (peak taken through the previous bar). No turn-up
// confirmation: on this window the bounce starts the minute the dip is
// deep enough, and waiting for a second confirming close gives the
// recovery away.
function dipBelow(dip: bigint): boolean {
  const n = closes.length;
  if (n < PEAK_BARS + 1) return false;
  const peak = trailPeak(n - 2, PEAK_BARS);
  return closes[n - 1] * BPS < peak * (BPS - dip);
}

// True when the latest close has hit the take-profit (+100 bps over the
// volume-weighted entry price) or the stop-loss (-200 bps under it).
function shouldExit(close: bigint): boolean {
  if (entryPrice === null) return false;
  const takeProfit = close * BPS >= entryPrice * (BPS + TAKE_PROFIT_BPS);
  const stopLoss = close * BPS <= entryPrice * (BPS - STOP_LOSS_BPS);
  return takeProfit || stopLoss;
}

function onBatch(state: BarsState, batch: Batch): OrderInput[] {
  // First, fold in the fills of the orders decided on the previous batch.
  for (const fill of batch.fills) {
    if (fill.symbol !== SYMBOL || fill.status !== 'filled') continue;
    const price = BigInt(fill.price);
    const qty = BigInt(fill.qty);
    if (fill.side === 'buy') {
      entryPrice = entryPrice === null
        ? price
        : (entryPrice * entryQty + price * qty) / (entryQty + qty);
      entryQty += qty;
    } else if (fill.side === 'sell') {
      entryPrice = null;
      entryQty = 0n;
    }
  }

  const close = state.close(SYMBOL);
  if (close === null) return [];
  closes.push(close);

  const held = state.positions.get(SYMBOL);
  if (held !== undefined && held.qty > 0n) {
    if (shouldExit(close)) {
      return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIP }];
    }
    // Holding and no exit: no top-ups, wait for the exit trigger.
    return [];
  }

  if (state.warmingUp) return [];

  // Single leg: dip of 120 bps or more below the trailing 120-bar peak,
  // full cash, gated on the 240-bar trend.
  if (dipBelow(DIP_BPS) && state.cash >= MIN_NOTIONAL) {
    const trend = r240();
    if (trend === null || trend > TREND_GATE_BPS) {
      return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIP }];
    }
  }

  return [];
}

await runBars({ onBatch });
