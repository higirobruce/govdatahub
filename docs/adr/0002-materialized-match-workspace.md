# Materialize allow-listed columns into a match workspace

Status: accepted (2026-09-16)

Entity matching compares Match Sources that may be live Connections of any of
nine database types or Staged Data, at up to ten million rows a side. Rather
than generate blocking and scoring SQL per dialect and run it inside each
source database, DataGate copies only a Match Project's allow-listed columns
into per-project tables in its own database, and runs every stage of matching
there. The blocking and scoring SQL is then written once, Connections and
Staged Data become interchangeable to the engine, and source databases only
ever serve simple ordered reads.

## Considered options

- **Push the SQL down into each source database.** Rejected: it needs
  per-dialect blocking SQL across nine drivers, MySQL has no trigram index, and
  it asks an agency's production database to run a two-hundred-million-pair
  join. The last point is a political problem as much as a technical one —
  DataGate does not get to put that load on a national register.
- **Stream rows into the application and match there.** Rejected: one
  implementation would serve every source, and the comparators would be pure
  and easily tested, but two hundred million pairs through Node is hours where
  the database is minutes, and it reimplements what the database already does
  well.

## Consequences

This copies personal data into DataGate's own database, which it previously
only read in place. Rwanda's Law No. 058/2021 and the National Data Sharing
Policy both bear on that, so the decision is only acceptable together with the
controls that make it so, and those controls are requirements rather than
recommendations: a per-project column allow-list enforced in one place, a
required lawful basis and named data owner on every Match Project, encryption
at rest, retention that deletes workspace data, and a hard refusal of any
non-local AI Provider so that the data never leaves the server.

A reader who removes any one of those controls has changed this decision, not
merely tidied it.
