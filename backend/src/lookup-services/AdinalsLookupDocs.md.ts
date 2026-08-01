const docs = `# Adinals lookup service

\`ls_adinals\` indexes immutable records and complete Adinal lifecycle
history. Both admissions and spends use whole-transaction notifications.
Normal spends mark and link retained history; they do not delete it.

Version 1 supports \`status\`, \`collections\`, \`collection\`, \`output\`,
\`ad\`, \`adsByCollection\`, \`history\`, \`adCurrent\`, \`collectionLive\`,
and \`pendingDecisions\` queries.
\`status\` returns an empty, valid output-reference formula; service phase and
version are exposed through metadata. \`output\` is an exact diagnostic lookup
for any retained topical outpoint; \`collection\` requires an actual collection
record. \`history\` returns only the collection, canonical mint, causally linked
ownership states, valid updates, and non-conflicting creator decisions. Current
\`adCurrent\` returns the minimal collection/current-state/creative/decision
proof set after applying owner epochs and open-versus-reviewed rules.
\`collectionLive\` deduplicates the complete current proof sets for every
canonical, unexpired slot. \`pendingDecisions\` returns current-epoch owner
updates that still need the named creator's verdict. An owner index remains a
later query.
Mint queries return only candidates whose signer, format, slot, and creative
limits resolve against a verified collection. Confirmed duplicate slots use
block/transaction order; ambiguous unconfirmed duplicates are quarantined.
`

export default docs
