# DataGate

DataGate is a data integration and analytics platform for organizations whose
data is scattered across separate databases. It connects to those databases,
catalogues what is in them, queries across them, checks their quality, and
resolves records that describe the same real-world entity.

This file is the project's ubiquitous language. It is a glossary and nothing
else — no architecture, no decisions, no specs. Architecture lives in
`CLAUDE.md`; designs and decisions live in `docs/`.

## Platform and tenancy

**DataGate**:
The product. The repository directory is named `govdatahub` for historical
reasons and the product was deliberately renamed.
_Avoid_: GovDataHub, Gov Data Hub, the platform

**Organization**:
The tenant. Every record in the system belongs to exactly one, and isolation
between them is absolute.
_Avoid_: tenant, workspace, account, company

**Role**:
A user's permission level within an Organization: super admin, org admin,
editor, or viewer. Editors and above may change content; viewers may only read.
_Avoid_: permission, access level, group

## Data sources

**Connection**:
A saved, named description of how to reach one external database, including its
credentials. It is a stored record, not a live socket — a Connection exists
whether or not anything is currently talking to the database.
_Avoid_: data source, datasource, database, server, endpoint

**Staged Data**:
A dataset that was imported into DataGate itself rather than read in place. It
is queryable like any other table but has no Connection behind it.
_Avoid_: staging table, upload, imported data, temp data

**Import Job**:
One attempt to bring external data into Staged Data, with its own status and
outcome. Staged Data is the result; the Import Job is the record of producing
it.
_Avoid_: import, upload job, ingestion run

## Catalog and schema

**Catalog**:
The browsable inventory of every table and column DataGate can reach, across
all Connections and Staged Data.
_Avoid_: data dictionary, metadata store, inventory

**Table Profile**:
A measured description of one table's contents — row counts, null rates, value
distributions per column. A Profile describes data, never a person.
_Avoid_: profile (unqualified), statistics, column stats

**Lineage**:
The graph of which tables feed which other tables. It is derived on request
from what the system knows, not maintained as a stored record.
_Avoid_: provenance, dependency graph, data flow

## Querying

The word "query" alone is ambiguous in this project. Always qualify it.

**Query Run**:
One execution of SQL against one Connection, with its result and timing.
_Avoid_: query (unqualified), execution, request

**Saved Query**:
SQL a user named and kept, to run again later by hand.
_Avoid_: bookmark, stored query, snippet

**Cross-Query**:
A single query that reads from more than one Connection at once. DataGate's
distinguishing capability, and the reason a Crosswalk matters.
_Avoid_: federated query, join query, multi-source query

**Transformation**:
SQL that runs on a schedule and writes its result somewhere. Distinguished from
a Saved Query by having an output and a schedule.
_Avoid_: job, ETL, materialized view, model

**Notebook**:
An ordered set of SQL and prose cells a user works through in sequence.
_Avoid_: worksheet, scratchpad, document

## Data operations

**Pipeline**:
An ordered graph of steps that runs as one unit on a schedule. A step may
import, transform, cross-query, export, or match.
_Avoid_: workflow, DAG, orchestration, flow

**Quality Check**:
An assertion about a table that either passes or fails — not null, unique, row
count, freshness, no duplicates, or custom SQL.
_Avoid_: test, rule, validation, assertion, expectation

**Run**:
Never used alone. A Pipeline Run, Transformation Run, Quality Check Run and
Match Run are four different things, and the bare word means none of them.

## Presentation

**Dashboard**:
A saved, server-held arrangement of charts over real data, shareable by link
and filterable by the viewer. The local-only builder page that seeds itself
with sample data is not a Dashboard.
_Avoid_: report, board, canvas, view

**Dataset Share**:
A grant of access to one dataset for someone outside the Organization, carried
by a token.
_Avoid_: public link, export, publication

## AI

**AI Provider**:
The configured source of model inference for an Organization. Local and custom
providers run on infrastructure the Organization controls; the hosted providers
send data elsewhere.
_Avoid_: LLM, model backend, engine

**AI Interaction**:
The audit record of one call to an AI Provider. It records size and metadata
about the call, never the data that was sent.
_Avoid_: log, trace, prompt record

**NL2SQL**:
Turning a question written in ordinary language into SQL against a known
schema.
_Avoid_: text-to-SQL, natural language query, ask-a-question

**Error Doctor**:
The diagnosis of a failed query — what went wrong, in plain language, with a
corrected query.
_Avoid_: fixer, SQL repair, autocorrect

**Semantic Catalog Search**:
Finding tables and columns by meaning rather than by name match.
_Avoid_: vector search, embedding search, fuzzy search

## Entity matching

**Match Project**:
The saved configuration for one matching problem: which data to compare, which
fields to compare, how strictly, and under what authority.
_Avoid_: matching config, linkage job, dedupe setup

**Match Source**:
One body of records a Match Project compares — either a table behind a
Connection, or a Staged Data dataset. Always qualified, because the bare word
"source" collides with Connection.
_Avoid_: source (unqualified), dataset, input, side

**Blocking Pass**:
One rule that proposes which records are worth comparing at all, so the system
never has to compare every record against every other.
_Avoid_: blocking key, candidate generation, prefilter, bucketing

**Candidate Pair**:
Two records a Blocking Pass proposed for comparison. A Candidate Pair is a
question, not an answer.
_Avoid_: pair, comparison, potential match

**Grey Band**:
The Candidate Pairs whose score is too high to reject and too low to accept.
The only pairs a person or a model ever looks at individually.
_Avoid_: uncertain zone, maybe band, review band, borderline

**Adjudication**:
A small local model reading one Candidate Pair and writing why it is or is not
a match. Adjudication explains; it never merges.
_Avoid_: AI decision, model verdict, auto-resolve

**Decision**:
A person's permanent verdict on one Candidate Pair. Decisions outlive the Match
Run that raised the pair, and a later run honours them rather than asking
again.
_Avoid_: review, feedback, label, confirmation

**Cluster**:
A set of records DataGate believes describe one real-world entity.
_Avoid_: group, match set, entity group, duplicate set

**Entity Key**:
The identifier for a Cluster, held stable across Match Runs so that anything
joining to it keeps working.
_Avoid_: golden ID, master ID, entity ID, survivor key

**Golden Record**:
One value per field chosen from a Cluster, each value carrying the record it
came from. It is a view of a Cluster, not a replacement for its members.
_Avoid_: master record, canonical record, single view

**Crosswalk**:
The published mapping from each original record to its Entity Key. The product
of matching, and the join key Cross-Query otherwise lacks.
_Avoid_: mapping table, xref, ID map, lookup

**Gold Set**:
Pairs a person labelled by hand, used to measure how well a Match Project
performs. Distinct from Decisions, which are working verdicts rather than a
measurement baseline.
_Avoid_: test set, ground truth, training data, benchmark
