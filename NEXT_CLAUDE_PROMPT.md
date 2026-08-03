● Working tree clean, docs committed. You're 1 ahead of origin/main — so you've
  already pushed the earlier eleven.

  Are we overlay-first now? For everything the application renders, yes. A page
  load asks the overlay first and only reaches GorillaPool if the overlay
  answers incompletely:

  ┌───────────────────────────────────┬──────────────────────────────┐
  │                                   │            source            │
  ├───────────────────────────────────┼──────────────────────────────┤
  │ Collection discovery and the list │ overlay                      │
  ├───────────────────────────────────┼──────────────────────────────┤
  │ Every collection and ad view      │ overlay                      │
  ├───────────────────────────────────┼──────────────────────────────┤
  │ Image creatives                   │ overlay, before confirmation │
  ├───────────────────────────────────┼──────────────────────────────┤
  │ Ownership history (public half)   │ overlay                      │
  ├───────────────────────────────────┼──────────────────────────────┤
  │ Custody                           │ your wallet, as always       │
  └───────────────────────────────────┴──────────────────────────────┘

  Fallback is whole-namespace or whole-collection, never per field, so a view is
  always attributable to one reader — and the collection view says which.

  Still GorillaPool, deliberately: the shadow-read baseline that catches
  divergence, the reconcile/backfill cron, content hosts as image fallback, and
  anything a third party reads through the embed or the derived JSON.

  Still open, in the order I'd take them:
  1. Third-party reads — embeds, the JSON reader, and agents still fetch content
  hosts, so the one-block image window persists for everyone who isn't using
  the app. This is now the largest gap between what the overlay can do and what
  people experience.
  2. The write path — broadcast still submits to GorillaPool and polls the exact
  outpoint. That poll exists to tell the UI when a record is visible to the
  path it reads from; now that reads have moved, it can become a fire-and-forget
  txid.
  3. Resolver indexing — findAllRecords is scanned once per collection per
  visit, which is load-bearing now that discovery reads every collection.
  4. Proof upgrade — records ingested while unconfirmed hold proof-less BEEF, so
  the node proves ancestry and signatures but not inclusion for its newest
  records. Until this lands, "verified" is the accurate word, not
  "SPV-complete".
  5. Federation — the only thing that removes GorillaPool from discovery of
  records nobody submitted.

  Session state: 258 tests, typecheck, self-test and build all passing; dev
  server on 5176 against the CARS node; cron reconciling hourly at :17 and
  backfilling at 04:43 while this machine is awake; local LARS still up on 8080
  holding its own copy.

✻ Brewed for 1m 47s

❯ are the docs updated with next prompt?                                        

● Good catch — let me check the continuation handoff itself, since that's the
  prompt a next session actually runs on.

● Bash(cd "/home/to/Desktop/WORKING 6-28/adinals" && awk '/^## Continuation
      handoff/,/^```$/' OVERLAY.md | head -20 && echo "=== the next-phase list
      ===" && awk '/^Imp…)
  ⎿  ## Continuation handoff

     Use this prompt when resuming the overlay work with another coding ses
     … +71 lines (ctrl+o to expand)

❯ need these to dos:   Still open, in the order I'd take them:                  
    1. Third-party reads — embeds, the JSON reader, and agents still fetch      
  content                                                                       
    hosts, so the one-block image window persists for everyone who isn't using  
    the app. This is now the largest gap between what the overlay can do and    
  what                                                                          
    people experience.                                                          
    2. The write path — broadcast still submits to GorillaPool and polls the    
  exact                                                                         
    outpoint. That poll exists to tell the UI when a record is visible to the   
    path it reads from; now that reads have moved, it can become a              
  fire-and-forget                                                               
    txid.                                                                       
    3. Resolver indexing — findAllRecords is scanned once per collection per    
    visit, which is load-bearing now that discovery reads every collection.     
    4. Proof upgrade — records ingested while unconfirmed hold proof-less BEEF, 
  so                                                                            
    the node proves ancestry and signatures but not inclusion for its newest    
    records. Until this lands, "verified" is the accurate word, not             
    "SPV-complete".                                                             
    5. Federation — the only thing that removes GorillaPool from discovery of   
    records nobody submitted.                                                   
                                                                                
    Session state: 258 tests, typecheck, s                                      

● They want that list in the handoff. Let me see the rest of the verified-state
  block so I can refresh it accurately:

● Bash(cd "/home/to/Desktop/WORKING 6-28/adinals" && awk '/^Verified state as
      of/,/^Implement the next phase:/' OVERLAY.md | head -75)
  ⎿  Verified state as of 2026-08-02, end of session:

     - The CARS shadow node is live at
     … +73 lines (ctrl+o to expand)

● The handoff still says "Reads have not moved. Every rendered value still comes
  from GorillaPool" — badly stale now. Rewriting it with your list:

● Bash(cd "/home/to/Desktop/WORKING 6-28/adinals" && python3 - <<'PY'
      p='OVERLAY.md'…)
  ⎿  Waiting…

────────────────────────────────────────────────────────────────────────────────
 Bash command

   cd "/home/to/Desktop/WORKING 6-28/adinals" && python3 - <<'PY'
   p='OVERLAY.md'
   s=open(p).read()

   s = s.replace("Verified state as of 2026-08-02, end of session:",
   "Verified state as of 2026-08-03, end of session:")

   s = s.replace("""- Reads have not moved. Every rendered value still comes
   from GorillaPool and
     the derived reader; the overlay is a write path plus a background
   comparison.
   - Local LARS still runs on `http://localhost:8080` but has deliberately
   diverged:
     it holds only the confirmed backfill and none of the day's live writes.
   - The namespace is now 6 collections, 22 mints, 38 lifecycle transitions,
   14
     updates, and 9 decisions, all matching the public reader.""","""- Local
   LARS runs on `http://localhost:8080` and has deliberately diverged: it
     holds the confirmed backfill plus whatever was submitted into it during
     testing. It is a disposable rebuild target, not a mirror.
   - The namespace is 8 collections, 27 ads, 16 updates, and 10 decisions,
   with the
     overlay and the public reader reporting identical counts.
   - A connected wallet offers the node the Adinals it holds, automatically
   once
     per wallet and endpoint per day and manually from the developer panel.
   It
     submits only lineages it can complete and names the missing predecessor
     otherwise. This is the one ingestion path with no third party in it.
   - `scripts/overlay-cron.sh` runs reconciliation hourly and the confirmed
     backfill daily under this machine's crontab. Cron only fires while the
   machine
     is awake; a systemd timer with `Persistent=true`, or a scheduled GitHub
     Action, are the options for making it machine-independent.
   - Image creatives are served from overlay evidence before confirmation,
   proven
     against a live unconfirmed mint carrying 2,713 bytes of PNG. The creator
   sees
     their own bytes at once, replaced by verified bytes when the submission
     reaches `indexed`.""")

   old_next = s[s.index("Implement the next phase:"):s.index("Alongside
   those: keep scheduled")]
   new_next = """Implement the next phase:

   Reads have moved. Discovery, every collection and ad view, image
   creatives, and
   the public half of ownership history all come from the overlay, with the
   existing reader as a whole-namespace fallback. What remains, in the order
   worth
   taking it:

   1. **Third-party reads.** Embeds, the derived JSON reader, and agents
   still
      fetch content hosts, so the one-block image window persists for
   everyone who
      is not using the application. This is now the largest gap between what
   the
      overlay can do and what people experience, and it is a change to the
   embed
      and the reader rather than to the protocol.
   2. **The write path.** Broadcast still submits to GorillaPool and polls
   the
      exact outpoint. That poll existed to tell the interface when a record
   became
      visible to the path it read from; now that reads have moved, it can
   become a
      fire-and-forget txid.
   3. **Resolver indexing.** `findAllRecords` is scanned once per collection
   per
      visit, which is load-bearing now that discovery reads every collection.
      Replace it with queries by collection and ad origin, and retain
   resolved
      current state alongside the evidence. This changes nothing a reader
   receives.
   4. **Proof upgrade.** Records ingested while unconfirmed hold proof-less
   BEEF,
      so the node proves ancestry and signatures but not inclusion for its
    2. The write path — broadcast still submits to GorillaPool and polls the    
  exact                                                                         
    outpoint. That poll exists to tell the UI when a record is visible to the   
    path it reads from; now that reads have moved, it can become a              
  fire-and-forget                                                               
    txid.                                                                       
    3. Resolver indexing — findAllRecords is scanned once per collection per    
    visit, which is load-bearing now that discovery reads every collection.     
    4. Proof upgrade — records ingested while unconfirmed hold proof-less BEEF, 
  so                                                                            
    the node proves ancestry and signatures but not inclusion for its newest    
    records. Until this lands, "verified" is the accurate word, not             
    "SPV-complete".                                                             
    5. Federation — the only thing that removes GorillaPool from discovery of   
    records nobody submitted.                                                   
                                                                                
    Session state: 258 tests, typecheck, s                                      

● They want that list in the handoff. Let me see the rest of the verified-state
  block so I can refresh it accurately:

● Bash(cd "/home/to/Desktop/WORKING 6-28/adinals" && awk '/^Verified state as
      of/,/^Implement the next phase:/' OVERLAY.md | head -75)
  ⎿  Verified state as of 2026-08-02, end of session:

     - The CARS shadow node is live at
     … +73 lines (ctrl+o to expand)

● The handoff still says "Reads have not moved. Every rendered value still comes
  from GorillaPool" — badly stale now. Rewriting it with your list:

● Bash(cd "/home/to/Desktop/WORKING 6-28/adinals" && python3 - <<'PY'
      p='OVERLAY.md'…)
  ⎿  Implement the next phase:

     Reads have moved. Discovery, every collection and ad view, image creat
     … +18 lines (ctrl+o to expand)

● Bash(cd "/home/to/Desktop/WORKING 6-28/adinals" && grep -n "Untested:" -A 4
      OVERLAY.md | head -12 && echo "=== matrix next order ===" && awk '/^##
      Next implementatio…)
  ⎿  995:- Untested: an overlay-served image creative in a browser, a live
     wallet
     996-  submission of a record the overlay actually lacks, proof upgrade
     … +7 lines (ctrl+o to expand)

● Bash(cd "/home/to/Desktop/WORKING 6-28/adinals" && sed -n '/^## Next
      implementation order/,/^Use the canonical/p' BRC100_COLLECTION_MATRIX.md)
  ⎿  ## Next implementation order

     1. Complete live restart recovery in Yours and Metanet, one image life
     … +20 lines (ctrl+o to expand)

● Two more stale spots — the "Untested" list and the matrix's implementation
  order:

● Bash(cd "/home/to/Desktop/WORKING 6-28/adinals" && python3 - <<'PY'
      p='OVERLAY.md'…)
  ⎿  Waiting…

────────────────────────────────────────────────────────────────────────────────
 Bash command

   cd "/home/to/Desktop/WORKING 6-28/adinals" && python3 - <<'PY'
   p='OVERLAY.md'
   s=open(p).read()
   s=s.replace("""- Untested: an overlay-served image creative in a browser,
   a live wallet
     submission of a record the overlay actually lacks, proof upgrade for
   records
     ingested while unconfirmed, and any image sequence repeated on Yours
   Wallet
     with this code.""","""- Untested: proof upgrade for records ingested
   while unconfirmed, any image
     sequence repeated on Yours Wallet with this code, and every intermediate
     commit in this session's history — only the final tree was built and
   tested,
     so a bisect through it could hit a commit that does not compile.""")
   open(p,'w').write(s)

   p='BRC100_COLLECTION_MATRIX.md'
   s=open(p).read()
   s=s.replace("""1. Complete live restart recovery in Yours and Metanet, one
   image lifecycle,
      and an emergency-switch preview drill.
   2. Tag the current frontend/reference verifier as `v0.1.0-beta`.
   3. Keep the scheduled `overlay:shadow` rounds running locally and retain
   every
      divergence report; the live wallet-to-LARS canary, namespace parity,
   and
      confirmed reconciliation have already passed.
   4. With a running Metanet Desktop wallet, create and fund a CARS mainnet
      project, set its identifier on the prepared `adinals-shadow`
   configuration,
      release the backend, replay the confirmed namespace into the new node,
   and
      require repeated clean remote shadow runs before moving the reader
   behind
      `api.adinals.com`.
   5. Publish a read-only agent package, followed by wallet-injected write
   actions.
   6. Add publisher moderation/reputation tools before promoting unrestricted
      collection discovery as trusted advertising inventory.""","""1. Move
   third-party reads onto the overlay: the embed component and the derived
      JSON reader still fetch content hosts, so the one-block image window
   persists
      for everyone not using the application. This is the largest remaining
   gap
      between what the node can prove and what people see.
   2. Simplify the write path. Broadcast still submits to GorillaPool and
   polls the
      exact outpoint; that poll told the interface when a record became
   visible to
      the path it read from, and reads have moved.
   3. Index the lookup resolver. `findAllRecords` is scanned once per
   collection
      per visit now that discovery reads every collection.
   4. Upgrade proofs after confirmation, so the node proves inclusion and not
   only
      ancestry for its newest records.
   5. Federate with SHIP, SLAP, and GASP once a second node runs
   `tm_adinals`; this
      is the only thing that removes GorillaPool from discovery.
   6. Complete live restart recovery in Yours and Metanet and an
   emergency-switch
      preview drill, then tag the reference application as `v0.1.0-beta`.
   7. Publish a read-only agent package against a stable `api.adinals.com`
   origin,
      followed by wallet-injected write actions.
   8. Add publisher moderation/reputation tools before promoting unrestricted
      collection discovery as trusted advertising inventory.""")
   open(p,'w').write(s)
   PY
   npm test 2>&1 | grep -E "^# (tests|pass|fail)" && git add OVERLAY.md

     - The CARS shadow node is live at
     … +73 lines (ctrl+o to expand)

● The handoff still says "Reads have not moved. Every rendered value still comes
  from GorillaPool" — badly stale now. Rewriting it with your list:

● Bash(cd "/home/to/Desktop/WORKING 6-28/adinals" && python3 - <<'PY'
      p='OVERLAY.md'…)
  ⎿  Implement the next phase:

     Reads have moved. Discovery, every collection and ad view, image creat
     … +18 lines (ctrl+o to expand)

● Bash(cd "/home/to/Desktop/WORKING 6-28/adinals" && grep -n "Untested:" -A 4
      OVERLAY.md | head -12 && echo "=== matrix next order ===" && awk '/^##
      Next implementatio…)
  ⎿  995:- Untested: an overlay-served image creative in a browser, a live
     wallet
     996-  submission of a record the overlay actually lacks, proof upgrade
     … +7 lines (ctrl+o to expand)

● Bash(cd "/home/to/Desktop/WORKING 6-28/adinals" && sed -n '/^## Next
      implementation order/,/^Use the canonical/p' BRC100_COLLECTION_MATRIX.md)
  ⎿  ## Next implementation order

     1. Complete live restart recovery in Yours and Metanet, one image life
     … +20 lines (ctrl+o to expand)

● Two more stale spots — the "Untested" list and the matrix's implementation
  order:

● Bash(cd "/home/to/Desktop/WORKING 6-28/adinals" && python3 - <<'PY'
      p='OVERLAY.md'…)
  ⎿  # tests 258
     # pass 258
     # fail 0
     … +3 lines (ctrl+o to expand)
  ⎿  You've hit your session limit · resets 2:10pm (America/Los_Angeles)

✻ Baked for 1m 43s

❯ /rate-limit-options                                                           

────────────────────────────────────────────────────────────────────────────────
  What do you want to do?

  ❯ 1. Stop and wait for limit to reset
    2. Upgrade your plan
    3. Upgrade to Team plan

  Enter to confirm · Esc to cancel



