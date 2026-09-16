# Build a record crosswalk, not master data management

Status: accepted (2026-09-16)

The September 2026 improvement review placed master data management out of
scope, on the grounds that RISA is procuring a Shared Government Data Hub with
an MDM layer, and DataGate should consume its golden records over an API. We
are reversing that, narrowly. Cross-Query is DataGate's distinguishing
capability and it is close to unusable on government data, because no two
agencies share a join key — so DataGate builds the Crosswalk that Cross-Query
needs, and nothing more.

## What this is not

The reversal is deliberately narrow, and the no-s matter as much as the yes:

- **Not a system of record.** DataGate's Clusters and Golden Records are a view
  over records that continue to belong to their source agencies.
- **Not golden-source arbitration across government.** Which agency is
  authoritative for a citizen's address is a policy question, not ours.
- **Not a replacement for the Hub's MDM layer.** When that layer exists and
  publishes Entity Keys, DataGate should consume them and retire its own for
  those entities.

## Consequences

The Crosswalk is now a published interface. Anything that joins to an Entity
Key depends on it staying stable across Match Runs, which is why stability is a
rule of the matching design rather than a nice property of it.

It also means DataGate holds citizen data it previously only read in place.
ADR-0002 covers that, and the governance rules it forces.
