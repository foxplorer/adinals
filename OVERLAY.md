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

`tm_adinals` validates complete BEEF and fails closed. It admits only exact,
case-sensitive production records using `app=adinals`, `type=ord`, and
`protocolVersion=3`, plus valid successor states that spend an already-admitted
Adinal.

| Transition | Outputs to admit | Previous inputs to retain |
| --- | --- | --- |
| Collection | Creator-signed collection record | None |
| Mint | Creator-signed `collectionItem` at output 0 | None |
| Listing | Recognized OrdLock output 0 | Adinal input 0 |
| Purchase | Buyer-controlled successor at output 0 | Listing input 0 |
| Cancellation | Seller-controlled successor at output 0 | Listing input 0 |
| Transfer | New-owner successor at output 0 | Adinal input 0 |
| Update | Same-owner successor output 0 and `adUpdate` output 1 | Adinal input 0 |
| Decision | Creator-signed `adDecision` record | None |

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
