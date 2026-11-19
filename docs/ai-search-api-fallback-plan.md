# Plan (not built): an OpenAI + Gemini API fallback for when Apify is down

Status: **plan only, for Paul's decision** (19 Nov 2026, v1-audits-self-healing). Nothing here is built.

## What we use today

Apify's `apify~google-search-scraper` asks the **consumer apps**: it drives ChatGPT's search and Gemini the way a customer
using the app would, and returns the answer text. That is what we promise to measure: what a customer sees when they ask.
Cost is about $0.0125 per question (ChatGPT + Gemini together, measured), plus about $0.006 for the separate Google AI run.

## The fallback

When Apify can't answer (outage, plan full for a long time, an engine hung), ask the same question through the providers'
own APIs, **with web search switched on**:

| | API route | Web search |
|---|---|---|
| ChatGPT | OpenAI Responses API, `web_search` tool | yes, OpenAI's own search |
| Gemini | Gemini API, "Grounding with Google Search" | yes, Google Search |
| Google AI (display only) | no API exists | not available, stays "not measured" |

## How the answers would differ from the consumer apps

- **Not the same product.** The apps add their own system prompt, local signals, personalisation, model routing and answer
  layout. The API answer, even with web search on, will often name different firms, in a different order. It is a close
  relative, not the same reading.
- **Location.** The apps infer the user's town. Through the API we have to put the town in the question (we already do:
  "best electrician in Kingston upon Thames") and, for OpenAI, pass an approximate user location (country GB, city).
- **Model choice is ours.** The app picks the model. We would pin one (e.g. the current default search model) and record it.
- **Not comparable with Apify answers over time.** A month-on-month comparison or a baseline (the guarantee measurement)
  must **never** mix API answers with app answers.

## How to label them

- Store every API answer with `source: "api"` and the model name beside the engine cell (Apify answers: `source: "app"`).
- Report: "Asked through the ChatGPT API (the app was unavailable)", in the evidence line beside that answer.
- **Never used for:** paid baselines, re-measures, the four-week results, or any guarantee figure. Prospect Quick checks only,
  and only when the app route failed after the self-heal's re-runs.
- The score treats an API answer like any answer for the room-left grading, but the report must show the label.

## Cost (to confirm against the providers' price pages before building — prices change)

- OpenAI web search: roughly $10–$25 per 1,000 searches for the tool, plus tokens (an answer of ~600 tokens is under $0.01).
  About **$0.02–$0.03 per question**.
- Gemini grounding: a free daily allowance on some models, then roughly $35 per 1,000 grounded prompts, plus tokens.
  About **$0.035–$0.04 per question** past the allowance.
- So about **2–5× the Apify price per answer**. Only used for answers still missing after the self-heal, which today is a
  handful a day, so pennies a day; in a full Apify outage (say 300 questions) about $15–$20 for the day.
- Needs: an OpenAI key we already hold (firm reading uses it; the credit ran out once on 13 Nov, which would stop this too)
  and a Gemini API key we do not have yet (Paul's to create).

## Build size

About a day: one `api-search.ts` adapter per provider that returns the same engine cell shape, a `source` field, the label
in the report, a hard block for baselines / re-measures, and a daily spend cap of its own.

## Recommendation

Not yet. Today's failures were our own scheduling (fixed), and the self-heal now fills missing answers from the real apps
within hours. Build the fallback only if the new AI-search health line shows Apify engine success below ~90% for days.
