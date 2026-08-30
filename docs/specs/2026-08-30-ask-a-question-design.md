# Ask a Question — Natural-Language Answers over Inventory Data

**Status:** Proposed (exploratory — not green-lit for build)
**Date:** 2026-08-30
**Revision:** 2 — LLM provider switched to Google Gemini (free testing phase); `AskSnapshot` renamed to `AskContext`.

---

## 1. The headline: RAG is the wrong tool here

The originating question was "could RAG help with that, or should it be something else?"

**Recommendation: do not build RAG. Build a single grounded LLM call over a
pre-computed JSON context ("context stuffing").** Three reasons, all grounded in
this repo rather than in general principle.

### 1.1 There is nothing to embed

Every column in `src/prisma/schema.prisma` is a number, a date, an enum, or a
short categorical label:

| Model | Fields |
|---|---|
| `Sales` | `listedPrice`, `profit`, `invest`, `nbTickets`, `status`, `soldAt`, `cancelledAt` |
| `Matches` | `date`, `atHome`, `competition`, `opponentId` |
| `MatchResults` | `score`, `isWin` |
| `SeasonPasses` | `price`, `label`, `category`, `row`, `seat`, `seasonStartYear` |
| `Opponents` | `name` |

There is not one free-text column in the schema. No notes, no descriptions, no
comments, no attachments, no support tickets. Vector search retrieves
semantically similar *prose*; there is no prose. Embedding `{profit: 42, status:
"SOLD"}` and cosine-matching it against "what was all-time revenue" retrieves
noise, because numeric equality and semantic similarity are unrelated.

### 1.2 RAG structurally cannot answer the questions being asked

"All-time revenue" is a `SUM` over every qualifying row. Retrieval returns
top-`k` chunks — by construction, a *subset*. Any RAG answer to a totals question
is extrapolated from a sample. For an application whose entire purpose is
tracking money, an answer that is confidently wrong by an unknown margin is the
worst available failure mode. This is a structural limitation, not a tuning
problem: no choice of embedding model, chunk size, or `k` makes retrieval
aggregate correctly.

### 1.3 The aggregates already exist, already correct

`src/api/accounting/interfaces/accounting.service.interface.ts` already exposes
exactly the questions in the original request:

```
getCurrentSeason(userId)                 -> TimePeriodAccounting
getAllTime(userId)                       -> TimePeriodAccounting
getGivenSeason(userId, seasonStartYear)  -> TimePeriodAccounting
getAmortization(userId, seasonStartYear) -> Amortization
```

`TimePeriodAccounting` already carries the realized / unrealized / pending split,
`seasonInvestments`, `totalSeasonInvestment`, and `leadTime`. `Accounting`
already carries `totalSales`, `totalProfit`, `totalInvest`, `totalNbTickets`,
`averageTicketPrice`, `averageProfit`, and `highest` / `lowest` with their
matches attached.

The example questions map onto methods that are already written, already
unit-tested (`accounting.service.spec.ts`), and already used by the dashboard.
The feature does not need a new retrieval system. It needs a narrator.

### 1.4 Why not NL-to-SQL either

NL-to-SQL is the obvious second guess and is also rejected, for two concrete
reasons in this codebase:

- **It discards the business logic that makes the numbers correct.** The season
  boundary is not a calendar year — `getSeasonBucket` in
  `src/shared/utils/season.utils.ts` runs 1 August to 31 July. "Realized" vs
  "unrealized" vs "pending" is a domain distinction layered over `SaleStatus`,
  not a raw column. A model writing SQL would re-derive both from the schema and
  get them subtly, silently wrong — off-by-one-season totals that look plausible.
- **It aims a text-generating model at a database containing `Users.password`.**
  Even read-only and single-table-scoped, this is a large attack surface added to
  a small app for no gain, since the aggregates already exist as typed methods.

### 1.5 Where retrieval *would* earn its place (explicitly out of scope)

If free-text ever enters the product — per-sale notes, buyer messages, an
imported email thread, uploaded PDFs of ticketing correspondence — then the
retrieval question genuinely reopens for *that* corpus only. It would sit beside
the numeric path, never replacing it: figures always come from the accounting
services, prose evidence from retrieval. Nothing in the current schema justifies
building it. Recorded here so the decision is revisited on a real trigger rather
than re-litigated from scratch.

### 1.6 The real choice, and the recommendation

| Option | Mechanism | Verdict |
|---|---|---|
| **A. Context stuffing** | Fetch existing accounting JSON, pass it whole with the question, get prose | **Recommended MVP** |
| **B. Tool calling** | Expose read-only tools wrapping existing services; model picks and fills params | Phase 3, when drill-downs outgrow the payload |
| **C. NL-to-SQL** | Model writes SQL | Rejected — §1.4 |
| **D. RAG** | Chunk + embed + vector search | Rejected — §1.1–1.2 |

Option A wins for this dataset because the entire answerable surface fits in one
payload. A season is roughly 19–25 home matches with a handful of sales each; the
context object in §3.2 is on the order of 2–6 KB of JSON. There is no tool loop
to go wrong, no tool arguments to hallucinate, no multi-turn latency, and one
network call per question.

Option B is a genuine upgrade path, not a consolation prize — it becomes correct
the moment questions need per-match or multi-season drill-down that would bloat
the payload. The architecture in §3 is deliberately shaped so B is an additive
change to one file, not a rewrite.

---

## 2. Scope

### 2.1 In scope

- One `POST /ask` endpoint returning a prose answer plus the figures it was grounded in.
- Available to **every authenticated user, scoped to their own data** — matching
  the existing `@Get('current-season')` pattern. No cross-user aggregation.
- One question at a time. No conversation history, no follow-ups.
- A minimal UI entry point on the dashboard.

### 2.2 Out of scope

- Multi-turn conversation and follow-up questions.
- Cross-user or admin-wide aggregation (nothing in the db layer does this today).
- Any write action. The endpoint is read-only; the model can never mutate state.
- Streaming responses.
- Embeddings, a vector store, RAG (§1.5).

### 2.3 Success criteria

1. The seven questions in §4.1 are answered correctly against seeded data.
2. Every figure in an answer is traceable to the context object — verified by the
   grounding contract in §3.4, not by reading answers and trusting them.
3. An unanswerable question gets an explicit refusal, never an invented number.
4. No LLM call is ever issued with another user's data in the payload.

---

## 3. Architecture

### 3.1 Module layout

Follows the project's hexagonal convention. The `ask` module performs no direct
database access — it composes existing services — so per the convention
("if a module has no DB access it has no `*.db.ts`") it has no db file. The
Gemini SDK is isolated in a dedicated client module that mirrors how
`FootballDataService` already isolates the football-data API.

```
src/llm/
  llm.module.ts
  llm.service.ts            <- ONLY file importing @google/genai
  llm.service.interface.ts
  types/

src/api/ask/
  ask.controller.ts         <- POST /ask, @User() scoped
  ask.module.ts
  ask.service.ts            <- orchestration; no SDK import, no Prisma import
  ask.service.spec.ts
  dto/ask-question.dto.ts
  interfaces/ask.service.interface.ts
  prompts/system-prompt.ts  <- frozen prompt text, own file
  context/build-context.ts
  context/build-context.spec.ts
  types/context.type.ts
```

Dependency direction: `AskController -> IAskService -> { IAccountingService,
IMatchesService, ILlmService }`. `LlmService` depends only on `ConfigService`
and the SDK. `AskService` never imports the SDK, so it is testable with a mocked
`ILlmService` and no network.

**Provider isolation is the point.** `ILlmService` is a provider-agnostic
interface (`complete(request) -> { text, inputTokens, outputTokens }`). Every
Gemini-specific detail — package, model ID, generation config, error classes —
lives inside `llm.service.ts`. Switching providers later touches that one file
and its dependency entry; `AskService`, its tests, the context builder, the
controller, and the frontend are all unaffected. This spec has already exercised
that property once: revision 1 targeted Anthropic, revision 2 targets Gemini, and
the change is confined to §3.3, §3.7, and one implementation file.

### 3.2 The ask context

`build-context.ts` is a pure function: existing service results in, a compact
plain object out. Purity is the point — it is unit-testable with fixtures and
contains no I/O.

The name is deliberate. This object is the *context handed to the model* — the
complete set of facts it is permitted to reason from. "Context" names its role in
the LLM call rather than describing it as a generic point-in-time copy.

`AskService.ask()` fetches, in parallel:

| Source | Method | Supplies |
|---|---|---|
| Accounting | `getCurrentSeason(userId)` | current season realized/unrealized/pending, investments, lead time |
| Accounting | `getAllTime(userId)` | all-time totals |
| Accounting | `getAmortization(userId, currentSeasonYear)` | break-even progress, per-match profit |
| Matches | `getCurrentSeason(true)` | fixture list, results, next match |

`buildAskContext()` then flattens these into an `AskContext` carrying an explicit
`generatedAt`, the resolved season window from `getCurrentSeasonDate()`, and a
`currency: "EUR"` marker. Season dates are passed as resolved ISO strings so the
model never infers the August-to-July boundary itself.

**Payload discipline.** The context is an allow-list built field by field, never
a spread of a service result. Two consequences: no `userId`, email, or password
hash can reach the API even by accident, and adding a field to `Accounting` later
cannot silently widen what leaves the process. `build-context.spec.ts` asserts
the absence of identity fields explicitly.

### 3.3 The LLM call

A single non-streaming generate-content call. No tool loop, no agent, no
conversation history.

- **Provider:** Google Gemini via the official Node SDK, package `@google/genai`.
- **Client:** `import { GoogleGenAI } from '@google/genai'` /
  `new GoogleGenAI({ apiKey })`. The key is passed **explicitly** from
  `ConfigService` rather than relying on SDK environment auto-discovery, so our
  env var name is our own convention and does not depend on unverified SDK
  behavior.
- **Model:** `gemini-3.7-flash` — the cheapest and fastest current tier, and the
  right default for a task that narrates a small JSON object.
- **Not streaming.** Answers are short and the SvelteKit entry point is a form
  action. Streaming is a phase-4 concern (§5).
- **Generation config — resolved at build time, not guessed here.** The
  parameters this design needs are: a system instruction (for the frozen prompt
  in §3.4), an output token cap, and access to token usage counts on the
  response. The exact field names and call shape in `@google/genai` are **not
  asserted by this spec** — see §6 open question 4. The implementation task
  introspects the installed package's type declarations and uses the real names.
  Deliberately *not* carried over from revision 1: `thinking`,
  `output_config.effort`, and `cache_control` are Anthropic-specific parameters
  with no assumed Gemini equivalent; if the SDK offers analogous controls they
  are optional tuning, not requirements of this design.
- **Cost:** the free tier is the entire point of this revision. Google AI Studio
  auto-provisions a free API key with no credit card required. Exact numeric rate
  limits are not published in the documentation and are visible per-account in
  the AI Studio dashboard. This is sufficient for a testing and personal-use
  phase; revisit if the per-user rate limit in §3.6 needs tuning against the real
  observed limits.

### 3.4 Grounding — how answers stay honest

Three independent layers, because prompt instructions alone are not a guarantee.

1. **The model only ever sees real numbers.** It receives an `AskContext`
   computed by the same already-tested service methods the dashboard renders. It
   is never asked to recall, retrieve, or compute a total from raw rows.

2. **The response returns the figures alongside the prose.** The endpoint
   returns both the answer text and a `figures` block derived from the
   `AskContext`. The UI renders the key figures *from the structured data*, next
   to the prose. The authoritative numbers on screen are rendered by the app from
   the database, not parsed out of model output. If the prose ever disagrees with
   the panel beside it, the user sees the discrepancy immediately rather than
   trusting a sentence.

3. **The system prompt forbids invention explicitly.** Frozen text in
   `prompts/system-prompt.ts` states: use only values present in the JSON
   payload; do not estimate, extrapolate, or infer values that are absent; if the
   question cannot be answered from the payload, say so plainly and name what is
   missing; all money is EUR; today's date is the payload's `generatedAt`.

The refusal path is a first-class success case, tested like any other (§4.1).

### 3.5 Auth and scoping

The global `JwtAuthGuard` in `app.module.ts` already protects the route; the
controller takes `@User() user: AuthenticatedUser` and passes `user.id` into every
service call, identical to `AccountingController`. No `RolesGuard` — this is a
per-user feature, not admin-only. `userId` is a service-call argument only and is
never serialized into the `AskContext` (§3.2), so it cannot leave the process.

### 3.6 Failure handling and abuse control

Following the `FootballDataService` precedent, `LlmService` translates transport
and provider failures into `DomainException` with codes from `ErrorCode`, so the
existing `AllExceptionsFilter` renders them consistently:

| Condition | Behavior |
|---|---|
| Missing `GEMINI_API_KEY` | Fails at boot via `env.schema.ts` validation, not at request time |
| Provider returns HTTP 429 | `DomainException(ASK_RATE_LIMITED)` -> 429, UI shows "try again in a moment" |
| Any other provider or network error | `DomainException(ASK_LLM_UNAVAILABLE)` -> 502, logged with full detail |
| Response blocked, empty, or with no text | Treated as unanswerable -> 422, generic message, logged |
| Question outside 3–500 chars | Rejected by `class-validator` in the DTO before any provider call |
| Per-user rate limit | Redis fixed-window counter, N questions/hour, 429 past the cap |

Error classification is expressed in terms of **HTTP status and response shape**,
not provider-specific exception class names, so it stays correct regardless of
what `@google/genai` names its error types.

The per-user rate limit is not optional polish. It matters more on a free tier,
not less: the account-level quota is shared across all users of the deployment,
so one user looping questions can exhaust the free allowance for everyone. Redis
is already wired (`src/redis/`), so this reuses existing infrastructure.

Every call logs question length, token usage, and latency — never the API key.
The existing pino `redact` config is extended to cover key-bearing headers.

### 3.7 Configuration

`env.schema.ts` gains a required `GEMINI_API_KEY: string` and an optional
`ASK_RATE_LIMIT_PER_HOUR: string`. `.env.example` documents both, including where
to obtain a free key (Google AI Studio). Making the key required means a
misconfigured deploy fails loudly at boot rather than silently 500-ing on the
first question.

### 3.8 Frontend entry point

Minimal by design. An "Ask" card on the existing dashboard: a text input, a
submit button, and an answer area. It posts through a SvelteKit form action in
`web/src/routes/(app)/dashboard/+page.server.ts`, reusing the `api` helper in
`$lib/api` — the same auth-forwarding path every other route already uses. The
answer area renders the prose plus a small figures panel from the returned
`figures` block (§3.4, layer 2).

No new route, no chat transcript, no client-side state beyond the pending flag.
Three example questions render as clickable chips so the feature is discoverable
without the user guessing what it can handle.

The frontend is fully provider-agnostic: it consumes the `AskAnswer` contract and
has no knowledge of which model produced the prose.

---

## 4. Testing

### 4.1 The supported-question set

The MVP is defined by the questions it answers correctly. These are the
acceptance criteria, exercised against seeded fixture data with a mocked
`ILlmService` for the deterministic parts:

1. "What's the current ongoing sale status?"
2. "What's my all-time revenue?"
3. "How's the current season going?"
4. "Have I broken even on my season pass yet?"
5. "What was my best sale this season?"
6. "How many tickets have I sold this season?"
7. "How long does it usually take me to sell a ticket?" (lead time)

Plus the required refusal case:

8. "What will next season's revenue be?" -> explicit refusal, no invented figure.

### 4.2 Test strategy

Per the project's Jest convention, each condition gets its own `describe`.

- **`build-context.spec.ts`** — pure function, fixtures in / object out. Covers
  the shape, the no-identity-fields assertion, and the null branches
  (`realized: null` when a user has no sales, no season pass, empty season).
- **`ask.service.spec.ts`** — `ILlmService` mocked entirely. Asserts that the
  right services are called with the right `userId`, that the `AskContext` handed
  to the LLM contains no identity fields, and that each failure mode in §3.6 maps
  to the right `DomainException`. No network, no provider quota consumed in CI.
- **Live checks** — the eight questions in §4.1 are run manually against real
  seeded data before release. Asserting on model prose in CI would be flaky and
  would consume free-tier quota on every run; the automated grounding guarantee
  lives in the context-builder and figures-panel tests instead.

---

## 5. Phasing

**Phase 1 — MVP (this spec).** `AskContext` + single grounded call + dashboard
card. Answers the eight questions in §4.1. Ships the whole feature.

**Phase 2 — Coverage.** Historical seasons ("how did 2023 compare to 2024"),
which needs the context to include prior-season summaries. Still option A —
just a wider context object. This is the point to measure payload size against
answer quality.

**Phase 3 — Tool calling.** When questions need drill-down the payload can't
carry (per-opponent breakdowns, arbitrary date ranges, per-match history), swap
the single call for the provider's function-calling surface with read-only tools
wrapping the same services. Additive: `LlmService` gains a method, `AskService`
gains a tool registry, the context builder and the entire grounding contract
survive intact.

**Phase 4 — Streaming.** Only if phase-3 latency becomes noticeable. The UI
changes; the backend contract does not.

Phases 2–4 are explicitly not committed. Phase 1 may prove the feature is not
worth extending, which is a valid outcome.

---

## 6. Open questions for the build decision

1. **Is one question per page load enough UX?** The spec deliberately omits
   conversation history. If follow-ups ("and last season?") turn out to be the
   natural way to use it, that changes the endpoint contract, not the
   architecture.
2. **Is `gemini-3.7-flash` good enough at this task?** Flash tiers are tuned for
   speed and cost, and this task is narration of a small JSON object rather than
   hard reasoning — a good match on paper. If answers prove sloppy about which
   number answers which question, moving up a tier is a one-constant change in
   `llm.service.ts`. Worth checking during the live run in §4.1.
3. **Does the figures panel actually get read?** It is the anti-hallucination
   backstop. If users ignore it, grounding rests on the prompt alone, which is
   weaker — worth watching during phase 1.
4. **Unresolved: the exact `@google/genai` call surface.** This spec does not
   assert the generate-content method name, the system-instruction config field,
   the output-token-cap field, or the token-usage field names on the response,
   because they were not verified and guessing them would produce confidently
   wrong code. The implementation plan resolves this deterministically by
   introspecting the installed package's `.d.ts` files before writing the client.
   Only `llm.service.ts` is affected.
5. **Unresolved: real free-tier limits.** Not published; visible per-account in
   the AI Studio dashboard. The default per-user cap in §3.6 (20/hour) is a
   placeholder chosen to be conservative, not one calibrated against a known
   quota. Check the dashboard once a key exists and tune
   `ASK_RATE_LIMIT_PER_HOUR` accordingly.
