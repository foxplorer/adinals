# Adinals overlay development

This document is the implementation and deployment plan for the Adinals
BRC-22/BRC-24/BRC-64 overlay. The overlay is a validated discovery and history
service, not protocol authority. Bitcoin transaction validity, spend-linked
custody, collection rules, and signatures remain authoritative.

## Delivery order

1. Run one overlay locally with LARS.
2. Make its topic manager and lookup service pass the retained production
   lifecycle vectors.
3. Submit every successful Adinals wallet action to the local overlay and
   compare its answers with GorillaPool and the current public reader.
4. Add confirmed-transaction reconciliation for spends created outside the
   Adinals application.
5. Deploy one production node with CARS only after local parity passes.
6. Keep GorillaPool/raw-transaction fallback during production shadow testing.
7. Add SHIP/SLAP advertisements and GASP synchronization when another
   compatible Adinals node exists; a second node is not required for the beta.

No public push or CARS deployment is required while the local implementation is
incomplete.

## Current implementation status

As of 2026-08-01, `@bsv/lars` 1.5.8 is installed in the root development
dependencies. The repository contains `deployment-info.json` plus an isolated
`backend/` package registering `tm_adinals` and `ls_adinals`. The first local
configuration runs the backend only on BSV mainnet; there is deliberately no
CARS project configuration yet.

The topic manager now admits valid production `collection` outputs after
independently checking the canonical inscription and MAP envelope, exact
namespace/version/subtype, standard SIGMA signature, and permanent collection
rules. It rejects the development namespace, changed signed bytes, invalid
rules, unrelated transactions, and malformed BEEF in backend tests. It also
admits signed, locally valid mint and decision candidates plus input-0-linked
listings, purchases, cancellations, ordinary P2PKH transfers, and updates. The
marketplace gate recognizes the exact pinned OrdLock contract and payout; the
update gate admits the same-owner successor at output 0 and signed sibling
record at output 1. The retained production chains pass these gates end to end.

The lookup resolver returns a mint only after matching its signer, format,
slot, and creative limits to a verified collection; confirmed duplicate slots
use block/transaction order, while multiple unconfirmed claims are
quarantined. The `history` query now follows retained `spentByTxid` links,
verifies each input-0 successor, derives owner epochs, validates updates against
collection and owner state, requires the collection creator for decisions, and
quarantines conflicting creator verdicts. Full live-creative and publisher
eligibility JSON remains in the separate reader layer, but the overlay now
returns the complete proof formulas for `adCurrent` and `collectionLive`. Do
not interpret a healthy server as full browser-reader parity.

The server parser deliberately has no runtime dependency on `@1sat/templates`.
That package's transitive `@1sat/types` release currently uses an extensionless
ESM import that Vite bundles but Node 22 cannot execute directly. The backend
therefore decodes the small canonical `ord` and MAP script envelopes itself,
with the already-public signed mainnet-development fixture as an independent
SIGMA conformance vector.

The lookup scaffold requests whole-transaction admission and spend
notifications and preserves spent rows by annotating them rather than deleting
them.

The first local LARS launch completed its image build and registered both
services. `GET /health`, `/listTopicManagers`, and
`/listLookupServiceProviders` respond on localhost. The status lookup returns
an empty `LookupFormula` because Overlay lookup services always return arrays
of verifiable output references; service phase/version is metadata, not
free-form lookup JSON.

LARS reserves ports 8080 (overlay), 8081 (optional Adminer), and 8082 (optional
Mongo Express). An older Space Payments overlay occupied 8080 and was stopped.
SkateSV still occupies the two optional UI ports, so Adinals was started with
only `overlay-dev-container` plus its MySQL and Mongo dependencies. Those UI
port conflicts do not affect `/submit` or `/lookup`.

The live HTTP smoke test proves rejection, record admission, lifecycle
admission, exact output retention, and idempotency:

- the already-public `adinals-brc100-test` Atomic BEEF returns no admitted
  outputs; and
- the proof-anchored production collection
  `b70c33ad75c6588826bfdb0cee0f9ed5aedc39b7856232f2b13a69f57e8f6ed2_0`
  returns `outputsToAdmit: [0]` and is returned by collection and exact-output
  lookup as hydrated, txid-checked BEEF.

Both retained production ads now replay from mint through listing, purchase,
update, and creator decision. On a clean database each mint, listing, purchase,
and decision admits output 0; each update admits outputs 0 and 1; every
spend-linked transition returns input 0 in `coinsToRetain`. A second full run
reported zero new and eleven already-present transactions while verifying every
retained outpoint. Each production `history` query returns exactly seven
semantically resolved outputs: collection, mint, listing, purchased state,
updated state, sibling update record, and creator decision.

Each production `adCurrent` query returns the complete seven-output reviewed
proof set: collection, every ownership state from mint through update, live
update record, and approving creator decision. The production `collectionLive`
query deduplicates the two retained fixture histories into 13 outputs. After
the confirmed namespace backfill adds Ad #1, the same query returns 19 outputs
and still contains every fixture proof. Its pending-decision query is empty
because the discovered production updates are already decided, while a positive
synthetic test proves an undecided current-epoch owner update is returned with
its supporting collection and custody chain.

The repeatable confirmed backfill now discovers the complete production v3
namespace exposed by GorillaPool. The 2026-08-01 clean replay found five
collections, 18 mint origins, 38 lifecycle transitions, 12 sibling update
records, and eight decisions. Updates are part of the lifecycle-transition
count, so this is 69 submitted transactions rather than 81. All 69 were newly
admitted on an empty local database with zero failures and no unresolved
confirmed spend links. An immediate repeat reported zero new, 69 already
present, and zero failures.

That replay caught two implementation defects before deployment. Large image
inscriptions were appended with JavaScript spread syntax and could overflow the
argument stack; parsing now iterates their bytes and has a 150 KB regression
vector. A pre-fix mint also proved that creator SIGMA authority and initial
spend-lock ownership may use different keys. Mint authority still comes from
the collection creator signature, while custody now comes from the one
unambiguous executable P2PKH lock embedded in the inscription script.

Unit coverage also proves open updates need no decision, disapproval
leaves the prior mint creative live, a new owner epoch resets creative to the
mint, conflicting decisions are quarantined, and expiration changes display
eligibility without deleting state.

Raw transaction hex alone is intentionally insufficient for `/submit`; the
engine rejected it until a confirmed GorillaPool BUMP was attached. A current
transaction's proof also makes its inputs redundant to the SDK's normal BEEF
serializer, but lifecycle classification still needs the immediate predecessor
script. Reconciliation therefore submits a valid regular BEEF containing the
separately proven predecessor and current transaction. The Topic Manager reads
that predecessor directly from the BEEF transaction set and rejects a topical
spend if the evidence is absent.

OverlayExpress invokes its STEAK callback before its storage mutations and
lookup notifications have necessarily completed. `/submit` success therefore
does not mean an immediate `/lookup` in the same event-loop turn will succeed.
The smoke runner polls the exact admitted outpoint for at most ten seconds
before submitting a dependent transaction. In normal local tests the delay is
only a fraction of a second.

In the current `@bsv/overlay` engine, returning empty admission instructions is
not the rejection signal: the transaction can still be recorded as applied and
an evidence-enriched retry will then be treated as a duplicate. `tm_adinals`
therefore throws for a well-formed transaction with no admissible Adinals
evidence, and also throws when `previousCoins` names a topical input whose
source transaction is absent from the submitted BEEF. A real topical spend
whose evidence is complete can retain its predecessor even if its unknown
successor shape is not admitted.

Run `npm run overlay:smoke` while localhost:8080 is live to replay both public
production lifecycle fixtures without creating or broadcasting a transaction.
An idempotent repeat may report no newly admitted outputs and must still return
every exact txid-verified output.

Local commands from the repository root are:

```sh
npm install --prefix backend
npm run overlay:typecheck
npm run overlay:test
npm run overlay:config
npm run overlay:start
npm run overlay:backfill -- --dry-run
npm run overlay:backfill
npm run overlay:smoke
```

LARS 1.5.8 starts on localhost by default; use its explicit `--with-ngrok` flag
only when a public development tunnel is actually wanted. `overlay:start`
requires Docker and Compose and may ask for server/provider key configuration.
Starting it is a separate step; dependency installation and unit tests do not
launch containers or expose a public tunnel.

## Repository layout

LARS runs from this repository root. The existing Vite application remains at
the root and continues to run on port `5176`; overlay code belongs in an
isolated backend package:

```text
deployment-info.json
backend/
  package.json
  tsconfig.json
  src/
    protocol/
    topic-managers/AdinalsTopicManager.ts
    lookup-services/AdinalsLookupServiceFactory.ts
    lookup-services/AdinalsStorage.ts
src/
  overlay/lifecycleParity.ts
tests/
  fixtures/overlay/
```

The backend must consume the same frozen version 3 validation rules as the
browser. A server copy must not drift silently: shared conformance vectors and
matching tests are mandatory, and extracting a shared protocol package is
preferred before production deployment if direct reuse is not reliable under
the CARS build boundary.

LARS 1.5.8 generates its overlay container by copying `backend/src` to
`/app/src`; it does not copy this repository's root `src`. A backend import such
as `../../src/protocol/...` may work on the host and then fail inside LARS.
Until a shared package is included in the generated build, server adapters live
under `backend/src/protocol` and must be checked against the root validator by
the same public conformance fixtures.

Generated LARS state, server keys, ARC credentials, ngrok configuration,
database files, and `local-data/` never belong in Git.

## Local HTTP boundary

OverlayExpress listens on `http://localhost:8080` under LARS.

### Submit

```http
POST /submit
Content-Type: application/octet-stream
x-topics: tm_adinals

<BEEF bytes>
```

Every successful collection, mint, update, decision, listing, cancellation,
purchase, and ordinary transfer performed through Adinals should submit its
verified transaction package to this endpoint. The wallet remains responsible
for keys and authorization.

### Lookup

```http
POST /lookup
Content-Type: application/json

{
  "service": "ls_adinals",
  "query": {
    "type": "ad",
    "origin": "<immutable-origin>"
  }
}
```

The generic path and envelope are provided by OverlayExpress. Adinals defines
and versions the query object. Initial query types are:

- `collection` by immutable origin;
- `collectionLive` by immutable origin;
- `ad` by immutable origin;
- `collections` with deterministic pagination;
- `collectionsByCreator`;
- `adsByOwner`;
- `pendingDecisions` by creator; and
- `history` by immutable ad origin.

Health and service discovery are available at `/health/live`, `/health/ready`,
`/health`, `/listTopicManagers`, and `/listLookupServiceProviders`.

During local development, the HTTP Vite application may call localhost. The
production HTTPS application must use the future CARS HTTPS endpoint or
`api.adinals.com`, never a localhost URL.

## Topic admission

`tm_adinals` validates complete BEEF and fails closed. Topic membership means
"credible Adinals evidence," not final display eligibility. It admits only
exact, case-sensitive production records using `app=adinals`, `type=ord`, and
`protocolVersion=3`, plus locally valid successor states that spend an
already-admitted Adinal. The lookup resolver performs cross-record validation
before an output is exposed as a valid collection, mint, decision, or live ad.

| Transition | Outputs to admit | Previous inputs to retain |
| --- | --- | --- |
| Collection | Creator-signed collection record | None |
| Mint | Signed, locally valid `collectionItem` candidate | None |
| Listing | Recognized OrdLock output 0 | Adinal input 0 |
| Purchase | Buyer-controlled successor at output 0 | Listing input 0 |
| Cancellation | Seller-controlled successor at output 0 | Listing input 0 |
| Transfer | New-owner successor at output 0 | Adinal input 0 |
| Update | Same-owner successor output 0 and `adUpdate` output 1 | Adinal input 0 |
| Decision | Signed, locally valid `adDecision` candidate | None |

For every spend-linked transition, input 0 must spend the exact current state.
Listings must decode as the recognized OrdLock contract. Purchases must execute
the purchase path and reproduce the encoded seller payout. Cancellations must
execute the seller path. Updates must preserve the owner at output 0 and bind
the sibling update at output 1. Unknown spend shapes are not interpreted as
valid marketplace or update events.

The Topic Manager receives `previousCoins`, the input indices that spend
previously admitted outputs. Returning those indices in `coinsToRetain`
preserves the historical chain required for BRC-64 lookup and GASP sync.
`identifyNeededInputs` should be implemented for historical ingestion so a
candidate successor can name the topical predecessors its validation requires.

### Version 3 cross-record boundary

A version 3 mint or decision names its collection origin in MAP metadata but
does not spend that collection output. BRC-22 gives a Topic Manager the current
BEEF and `previousCoins`; `identifyNeededInputs` can request actual transaction
inputs, not arbitrary metadata references. A stateless manager therefore
cannot prove the mint signer equals the referenced collection creator unless
that separate evidence happens to be bundled.

The deterministic v3 overlay consequently separates candidate admission from
semantic resolution:

- the Topic Manager checks the complete BEEF, exact record envelope, SIGMA,
  subtype-local fields, and spend-linked ancestry available in
  `previousCoins`;
- the Lookup Service stores candidate evidence but resolves referenced
  collection rules and creator authority before returning protocol-valid or
  live results;
- unresolved, conflicting, wrong-creator, and duplicate-slot candidates remain
  quarantined and never become display-eligible; and
- network/indexer lookups are reconciliation inputs, not hidden dependencies
  inside Topic Manager consensus.

Collections need no prior protocol record, so their full admission gate is
self-contained. A future protocol version could make other record
relationships UTXO-linked, but version 3 must be indexed according to the
records already on chain.

## Lookup and storage behavior

`ls_adinals` uses:

- `admissionMode = "whole-tx"`, so admission callbacks receive Atomic BEEF;
- `spendNotificationMode = "whole-tx"`, so a spend can be classified as a
  listing, purchase, cancellation, transfer, or update; and
- idempotent upserts keyed by transaction ID and output index.

Unlike a simple current-UTXO index, `outputSpent` must not delete Adinals
history. It marks the previous state spent, records the consuming transaction,
classifies the event, and links the successor. Legal eviction remains separate
from ordinary spending.

The first storage model should distinguish:

- immutable protocol records;
- permanent collection and Adinal origins;
- every ownership-state outpoint;
- listings and their terms;
- lifecycle events and their consuming transactions;
- updates and creator decisions;
- derived current state; and
- reconciliation status and last verified chain height.

Lookup answers return verifiable output references/BEEF through the overlay
engine. Derived JSON for embedders and agents remains a separate reader layer
that reuses the same protocol resolver and reports its evidence source.

## Ingestion and missing transactions

A single overlay sees a transition when the transaction is submitted to its
topic, synchronized from a compatible peer, or found by reconciliation. It does
not automatically learn every external 1Sat Market spend.

The beta therefore uses three paths:

1. **Immediate:** every Adinals action posts its verified BEEF to `/submit`.
2. **Reconciliation:** periodically follow known outpoint spends through
   GorillaPool and independently verify raw transactions before ingestion.
3. **Federation later:** use SHIP/SLAP discovery and GASP synchronization after
   another node supports `tm_adinals` and `ls_adinals`.

Missing or contradictory evidence produces a provisional/degraded response,
never an invented owner or creative. The overlay must be rebuildable from
public confirmed transactions.

### Historical backfill

The overlay does not need a fresh protocol launch. The repeatable
`scripts/overlay-backfill.ts` command reconstructs confirmed version 3 history
already on chain:

1. discover collection, mint, update, and decision candidates through
   GorillaPool searches;
2. fetch each candidate's confirmed raw transaction plus BUMP, verify its txid,
   and submit proof-anchored BEEF; every spend package must also contain its
   separately proven immediate predecessor transaction;
3. process collections before mints, then resolve all known Adinal spend chains
   to recover listings, purchases, cancellations, transfers, and updates;
4. submit decisions after their update transitions; and
5. compare the rebuilt state with the retained production lifecycle manifest
   and current reader.

Discovery rows do not grant admission. Every fetched transaction passes the
same local topic and lookup gates as a newly submitted transaction. Confirmed
history is recoverable; a transaction that was never confirmed and has fallen
out of every mempool has no durable protocol state to restore.

Use `npm run overlay:backfill -- --dry-run` to inventory the full namespace
without submitting anything. Add `--collection=<immutable_outpoint>` to scope
either a dry run or replay to one collection. The non-dry command is idempotent:
it polls exact output lookup after each STEAK response before submitting a
dependent spend.

## Parity gates

The retained fixture
`tests/fixtures/overlay/production-lifecycle-b70c33ad.json` covers two public
mainnet mint → listing → purchase → update → approval chains. Before CARS, the
local overlay must reproduce:

- collection creator, rules, capacity, and expiration;
- immutable ad origins and deterministic slots;
- every ownership outpoint in order;
- listing seller and price;
- buyer and owner epoch;
- exact update successor and sibling record;
- exact creator decision references; and
- current owner, proposal status, and live creative.

Additional gates are:

- rejection of other MAP namespaces, versions, and record subtypes;
- rejection of unrelated inscription, PushDrop, P2PKH, and OrdLock outputs;
- rejection of malformed or incomplete BEEF;
- duplicate-slot and conflicting-decision quarantine;
- parity with the current reader on confirmed state;
- immediate visibility for an Adinals-submitted unconfirmed transition;
- confirmed reconciliation of an externally created marketplace spend; and
- expiration-aware display eligibility.

## Next implementation milestone

The immutable envelope, collection, mint, decision-candidate, OrdLock, and
spend-linked lifecycle admission gates are complete against both retained
production chains. Semantic `history`, `adCurrent`, `collectionLive`, and
pending-decision resolution also pass their production and synthetic gates.
Next:

1. connect successful wallet actions to immediate overlay submission, retaining
   GorillaPool reconciliation for transactions made elsewhere; and
2. run automated dual-read parity against the existing browser reader before
   CARS, including namespace-wide current-owner and live-creative comparisons;
   and
3. deploy one CARS node in shadow mode after parity passes, while
   keeping derived embed JSON in the separate reader layer.

The topic manager stays fail closed for every transition that has not reached
its gate.

## Continuation handoff

Use this prompt when resuming the overlay work with another coding session:

```text
Continue the Adinals overlay work in:

/home/to/Desktop/WORKING 6-28/adinals

Read OVERLAY.md, README.md, and BRC100_COLLECTION_MATRIX.md completely first,
then inspect git status. Preserve existing work and keep all three documents
current. Do not commit, push, or deploy unless explicitly requested.

Verified state as of 2026-08-01:

- Local LARS uses http://localhost:8080 with tm_adinals and ls_adinals.
- The confirmed production v3 discovery set contains 5 collections, 18 mint
  origins, 38 lifecycle transitions, 12 sibling updates, and 8 decisions.
- A clean namespace replay admitted 69 transactions with zero failures or
  unresolved confirmed spend links.
- An idempotent replay reported 0 new, 69 already present, and 0 failures.
- The populated semantic smoke test passes, including both retained complete
  sale/update/approval histories and a 19-output collectionLive proof set.
- All 27 application test files, all 6 backend test files, TypeScript, and the
  production Vite build pass.
- Large-inscription parsing and distinct mint creator/spend-lock owner handling
  are covered by regression tests.

Implement the next phase:

1. Add one reusable overlay client for /submit and /lookup.
2. After every successful wallet broadcast, submit the same locally verified
   BEEF to tm_adinals. Include the exact immediate predecessor transaction in
   lifecycle packages.
3. Treat the STEAK response as processing acknowledgment, then poll exact
   output lookup and expose provisional, indexed, retrying, and failed states.
4. Never turn an already-broadcast wallet action into a failed action because
   overlay submission is unavailable. Queue an idempotent retry and reconcile
   it later.
5. Add a frontend overlay reader adapter and dual-read it against the current
   GorillaPool/reference reader. Compare collection membership, ownership
   history, current owner, owner epoch, listing, pending decision, creative,
   expiration, and display eligibility.
6. Add confirmed server-side reconciliation for transactions created outside
   Adinals or missed when a browser closes.
7. Keep GorillaPool as fallback and do not switch production reads until parity
   has no unexplained divergence.
8. Test successful submission, delayed lookup storage, duplicate submission,
   overlay outage after broadcast, external-spend reconciliation, and parity
   disagreement.
9. Update OVERLAY.md, README.md, and BRC100_COLLECTION_MATRIX.md with exact
   results.

If LARS is stopped, start only the required services so ports 8081 and 8082
remain available to the existing local projects:

docker compose -p lars_adinals -f local-data/docker-compose.yml up -d mysql mongo overlay-dev-container

Do not clear local-data unless a clean rebuild of the disposable overlay is
genuinely required. Do not include generated keys, database state, wallet-local
references, or unbroadcast Atomic BEEF in a public commit.
```

## CARS gate

Deploy with CARS only after the local overlay passes the parity suite and can be
rebuilt from its retained fixtures/reconciliation inputs. The first production
deployment remains a single node in shadow mode. It does not replace
GorillaPool or become the default `api.adinals.com` reader until repeated
dual-read comparisons show no unexplained divergence.

## AdventureSV template note

`/home/to/Desktop/Medford_AdventureSV/full-stack-project-template` is a useful
LARS/CARS layout reference. Its current topic manager does **not** admit every
overlay output: it requires the exact AdventureSV PushDrop marker and a valid
`aoc.v1` sibling record, with regression tests rejecting unrelated protocols.

It must not be copied as Adinals lifecycle logic. That application returns no
`coinsToRetain`, uses transaction-ID-only spend notifications, and deletes its
spent lookup rows. Those choices are appropriate for its current public feed
but would lose the sale, purchase, cancellation, transfer, and update history
that Adinals requires.
