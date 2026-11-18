# BTC dip-buying bot — btc-race-24h-20261118-1444

[![make.fun](https://img.shields.io/badge/make.fun-btc--race--24h--20261118--1444-blue)](https://make.fun)

Trades CBBTC (Coinbase Wrapped BTC) against USDC on 1-minute bars, long only,
starting from 1,000 USDC of paper money. Harness: agent-fun/bars-replay/v1.

## Strategy

Wait for price to dip 120 bps or more below its trailing 120-bar peak, then
buy the dip with all the cash. The entry fires on the first close that sits
that far below the peak (peak taken through the previous bar) — no turn-up
confirmation, because on this slow, low-volatility window the bounce starts
the minute the dip is deep enough and waiting for a confirming close gives
the recovery away. A 240-bar trend gate blocks entries when the 240-bar
return is worse than -100 bps, so the bot does not catch a falling knife in
a steep downtrend.

Every position exits in full (max slippage 200 bps) on take-profit of
+100 bps or stop-loss of -200 bps versus the volume-weighted average entry
price. The take-profit is 100, not 120: on the dev window the bounce after
a 120 bps dip recovers about 90-100 bps before fading, so a 120 target
strands the trade (local grade with TP 120: -$7.09) while 100 banks it.
No top-ups while holding, no entries during warm-up, no shorts, no leverage.

## Parameters

| Parameter | Value |
| --- | --- |
| Trailing peak window | 120 bars |
| Dip | 120 bps below trailing peak |
| Entry | First close at/below the dip, full cash |
| 240-bar trend gate | return > -100 bps |
| Take-profit | +100 bps vs VWAP entry |
| Stop-loss | -200 bps vs VWAP entry |
| Max slippage | 200 bps |
| Min notional | 1,000,000 quote units (1 USDC) |

All arithmetic is bigint; no clock, no randomness, no network, no
environment reads. Only import is the vendored kit SDK shim
(`./vendor/makefun-bars.ts`, byte-copy of the kit's `sdk/makefun-bars.ts`).

## Run

```sh
node cli/makefun.mjs grade-local --kit <kit> --bot <repo> --driver process
```

## Dev-window results (local grade, `grade-local --driver process`)

New dev window (this competition, 2026-11-17T14:44Z → 2026-11-18T14:44Z):

- Net PnL: **+15.659110 USDC** (return +1.566%), 4 trades, win rate 1.00,
  max drawdown 0.758%, fees 1.613024 USDC, guardrails met.
- Action log sha256:
  `f2c55ebac083f91293f9c34da2125db1bf59eb454f5877e6b40f1b2916c69ab9`
  (two executions, byte-identical action logs — L1 regrade reproduced
  byte for byte).

Old dev window (previous race, 2026-11-17-0603 kit, robustness check only):

- Net PnL: **+17.225793 USDC**, 5 trades, win rate 0.67,
  max drawdown 1.316%, guardrails met.

## Honest assessment

The bot makes money on both dev windows, but only through two round trips
per window — the race window's PnL will hinge on one or two trades, so the
outcome is high-variance. The previous race's 10th-place line was about
+$14.35, and this bot's dev PnLs (+$15.66 / +$17.23) sit just above that
level, so top 10 is plausible but not assured; top 5 would need the race
window to offer two clean dips like the dev windows did.
