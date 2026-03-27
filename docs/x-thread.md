# X Thread — The Snitch Launch

6-tweet thread for announcing The Snitch. Fill in placeholders with real investigation data before posting.

---

## Tweet 1 — Hook + Report Card

> I built The Snitch — an autonomous on-chain forensic agent powered by @nansen_ai
>
> It traces wallet connections, detects suspicious trading, and auto-generates intelligence reports.
>
> Here's what it found on ${{TOKEN_SYMBOL}}:
>
> #NansenCLI

**Attach:** Forensic report card image (download from investigation page)

---

## Tweet 2 — Timeline Card

> {{HOURS}} hours before a {{PERCENT}}% {{DIRECTION}}, {{NUM_WALLETS}} wallets quietly bought ${{VOLUME}}.
>
> The Snitch traced them using Nansen's profiler trace — multi-hop BFS graph traversal. {{CONNECTION_DETAIL}}.
>
> Suspicion score: {{SCORE}}/100

**Attach:** Timeline card image

---

## Tweet 3 — Tech Flex

> Under the hood: 22 unique Nansen CLI endpoints across 4 domains
>
> • profiler trace / batch / compare (wallet graphs)
> • token flow-intelligence (labeled flows)
> • smart-money dex-trades + netflow
> • prediction-market forensics
> • + Gemini AI for case narratives

---

## Tweet 4 — Prediction Market Mode

> It also investigates Polymarket.
>
> Who profited most from resolved events? Did they know the outcome beforehand?
>
> The Snitch traces their wallets, checks timing, and scores it.

**Attach:** PM report card image (if available)

---

## Tweet 5 — Autonomous Mode

> The autonomous monitor watches 24/7:
> • Smart money making large trades
> • Net flow reversals
> • Prediction market odds swings
>
> Auto-generates forensic reports. Like having a Nansen analyst on staff.

---

## Tweet 6 — CTA

> Try it: {{SITE_URL}}
>
> The Snitch sees everything.

---

## Posting Checklist

- [ ] Research 3-4 tokens with notable recent price movements
- [ ] Run `pnpm seed-demo` with those tokens configured
- [ ] Download report card + timeline card images from the investigation pages
- [ ] Fill in all `{{PLACEHOLDER}}` values with real data
- [ ] Verify all images are 1200x630 and look good in Twitter card preview
- [ ] Post thread, tag @nansen_ai, include #NansenCLI
