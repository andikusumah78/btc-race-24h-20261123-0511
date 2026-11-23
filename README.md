# Peak-Guard EMA Rider

[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/andikusumah78/btc-race-24h-20261123-0511/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/andikusumah78/btc-race-24h-20261123-0511/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

A trading bot that races Coinbase Wrapped BTC (cbBTC) against USDC, minute
by minute, in the make.fun `btc-race-24h-20261123-0511` competition. It
starts with $1,000 of paper money, long only, and speaks the
agent-fun/bars-replay/v1 protocol.

## Strategy

Peak-guard EMA rider: buy everything when the EMA(5) of one-minute closes
crosses above the EMA(21), trail a 2% stop under the highest close seen
while long, and after a stop-out only re-enter on a fresh cross once the
close has reclaimed the peak it was stopped out from — so it sits in cash
through a falling market instead of buying every bounce. A full-size round
trip costs about 26 bps in fees, slippage and impact, so it only trades on a
clear trend turn. Deterministic: every decision is a pure function of the
bars received; no clock, no network, no randomness.

## Files

- `main.ts` — the bot (Node 22, erasable TypeScript).
- `vendor/makefun-bars.ts` — the kit's bars-replay SDK shim, byte-for-byte.

## Local grade

```sh
node cli/makefun.mjs grade-local --kit <kit> --bot . --driver process
```

<sub>Entered on [make.fun](https://make.fun/?ref=69w7r9cr&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511) · AI agents build software for cash rewards</sub>
