'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { api } from '@/lib/api';
import type {
  BlockingEstimate,
  BlockingKind,
  BlockingPass,
  CreateMatchProjectBody,
  FieldMapping,
  FieldRole,
  MatchProjectDto,
  MatchSourceRef,
} from '@/lib/api';
import type { Connection, ColumnInfo, TableInfo } from '@/types';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Loader2,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';

// ============================================================================
// Local types
// ============================================================================

type SourceKind = 'connection' | 'staged';
type KeyFunction = 'none' | 'dmetaphone' | 'year' | 'last9';

/** One column, whichever kind of Match Source it came from. */
interface AvailableColumn {
  name: string;
  type: string;
}

/**
 * Trimmed shape of what `api.ingestion.listStagedData()` actually returns
 * for each row (StagedData entity — see packages/backend/src/database/
 * entities/staged-data.entity.ts). That endpoint types its response as
 * `any`; this is the frontend's own contract with it.
 */
interface StagedDatasetSummary {
  id: string;
  tableName: string;
  rowCount: number;
  schema: Array<{ name: string; type: string; sample: unknown }>;
}

/** One term of a Blocking Pass's `keyExpr` (see blocking-sql.ts:compileKeyTerm). */
interface KeyTerm {
  field: string;
  fn: KeyFunction;
}

/** A Blocking Pass, kept in a form the UI can edit term-by-term; converted to a real `BlockingPass` on submit. */
interface PassDraft {
  name: string;
  kind: BlockingKind;
  terms: KeyTerm[];
  threshold: number;
}

const FIELD_ROLES: { value: FieldRole; label: string; comparatorNote: string }[] = [
  { value: 'person_name', label: 'Person name', comparatorNote: 'scored by trigram similarity' },
  { value: 'org_name', label: 'Organization name', comparatorNote: 'scored by trigram similarity' },
  { value: 'text', label: 'Text', comparatorNote: 'scored by trigram similarity' },
  { value: 'address', label: 'Address', comparatorNote: 'scored by trigram similarity' },
  { value: 'date', label: 'Date', comparatorNote: 'scored by day-difference decay' },
  { value: 'phone', label: 'Phone', comparatorNote: 'scored by exact match' },
  { value: 'identifier', label: 'Identifier', comparatorNote: 'scored by exact match' },
];

/**
 * The comparator name mirrors packages/backend/src/modules/matching/
 * blocking-sql.ts:comparatorExprs — the FIRST entry for the role, because
 * that is the one `weightedScoreExpr` actually uses for scoring. The
 * `comparator` field on FieldMapping is required by validation but has no
 * reader anywhere in the engine today; this derives a value that is at
 * least an accurate description of current behaviour, rather than
 * exposing a picker whose choice would silently do nothing.
 */
function defaultComparatorFor(role: FieldRole): string {
  switch (role) {
    case 'person_name':
    case 'org_name':
    case 'text':
    case 'address':
      return 'trgm';
    case 'date':
      return 'daydiff';
    default:
      return 'exact';
  }
}

const KEY_FUNCTIONS: { value: KeyFunction; label: string }[] = [
  { value: 'none', label: 'exact value' },
  { value: 'dmetaphone', label: 'sounds like (dmetaphone)' },
  { value: 'year', label: 'year only' },
  { value: 'last9', label: 'last 9 digits' },
];

function keyExprFromTerms(terms: KeyTerm[]): string {
  return terms
    .map((t) => (t.fn === 'none' ? t.field : `${t.fn}(${t.field})`))
    .filter(Boolean)
    .join('|');
}

function passDraftToBlockingPass(draft: PassDraft): BlockingPass {
  return {
    name: draft.name,
    kind: draft.kind,
    keyExpr: keyExprFromTerms(draft.terms),
    threshold: draft.kind === 'trigram' ? draft.threshold : undefined,
  };
}

const STEPS = [
  { id: 0, label: 'Match Source' },
  { id: 1, label: 'Field map' },
  { id: 2, label: 'Blocking' },
  { id: 3, label: 'Thresholds & authority' },
] as const;

// ============================================================================
// Page
// ============================================================================

export default function NewMatchProjectPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [step, setStep] = useState(0);

  // Project-level
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Step 1 — Match Source
  const [sourceKind, setSourceKind] = useState<SourceKind>('connection');
  const [connectionId, setConnectionId] = useState('');
  const [schemaName, setSchemaName] = useState('');
  const [tableName, setTableName] = useState('');
  const [stagedDataId, setStagedDataId] = useState('');
  const [primaryKey, setPrimaryKey] = useState('');

  // Step 2 — Field map
  const [fieldMap, setFieldMap] = useState<FieldMapping[]>([]);

  // Step 3 — Blocking
  const [passes, setPasses] = useState<PassDraft[]>([]);
  const [estimate, setEstimate] = useState<BlockingEstimate | null>(null);
  const [estimateUnavailable, setEstimateUnavailable] = useState(false);
  const [estimating, setEstimating] = useState(false);

  // Step 4 — Thresholds & authority
  const [matchAt, setMatchAt] = useState(0.9);
  const [rejectAt, setRejectAt] = useState(0.5);
  const [lawfulBasis, setLawfulBasis] = useState('');
  const [dataOwner, setDataOwner] = useState('');
  const [retentionDays, setRetentionDays] = useState(30);

  // Draft project, created (or updated) the first time it's needed by
  // Estimate or by the final submit.
  const [projectId, setProjectId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ── Data for Step 1 ──────────────────────────────────────────────────
  const { data: connections } = useSWR<Connection[]>('/connections', () => api.connections.list());
  const { data: tables } = useSWR<TableInfo[]>(
    sourceKind === 'connection' && connectionId ? `/connections/${connectionId}/schema/tables` : null,
    () => api.schema.getTables(connectionId),
  );
  const { data: connectionColumns } = useSWR<ColumnInfo[]>(
    sourceKind === 'connection' && connectionId && tableName
      ? `/connections/${connectionId}/schema/tables/${tableName}/columns/${schemaName}`
      : null,
    () => api.schema.getColumns(connectionId, tableName, schemaName),
  );
  const { data: stagedList } = useSWR(
    sourceKind === 'staged' ? '/ingestion/staged' : null,
    () => api.ingestion.listStagedData() as Promise<{ datasets: StagedDatasetSummary[]; total: number }>,
  );

  const selectedStagedDataset = useMemo(
    () => stagedList?.datasets.find((d) => d.id === stagedDataId) ?? null,
    [stagedList, stagedDataId],
  );

  const availableColumns: AvailableColumn[] = useMemo(() => {
    if (sourceKind === 'connection') {
      return (connectionColumns ?? []).map((c) => ({ name: c.name, type: c.type }));
    }
    return (selectedStagedDataset?.schema ?? []).map((c) => ({ name: c.name, type: c.type }));
  }, [sourceKind, connectionColumns, selectedStagedDataset]);

  // ── Derived values ───────────────────────────────────────────────────

  const leftSource: MatchSourceRef | null = useMemo(() => {
    if (!primaryKey) return null;
    if (sourceKind === 'connection') {
      if (!connectionId || !tableName) return null;
      return { kind: 'connection', connectionId, schemaName, tableName, primaryKey };
    }
    if (!stagedDataId) return null;
    return { kind: 'staged', stagedDataId, primaryKey };
  }, [sourceKind, connectionId, schemaName, tableName, stagedDataId, primaryKey]);

  /**
   * Ruling P4/R10: the allow-list is the chosen field-map columns PLUS the
   * primary key picked in step 1 — omitting the key makes materialization
   * refuse every column reference built from it.
   */
  const columnAllowlist: string[] = useMemo(() => {
    const cols = fieldMap.map((f) => f.left);
    return Array.from(new Set([primaryKey, ...cols].filter((c) => c && c.length > 0)));
  }, [fieldMap, primaryKey]);

  const step1Valid = leftSource !== null;
  const step2Valid = fieldMap.length > 0 && fieldMap.every((f) => f.weight > 0);
  const step3Valid =
    passes.length > 0 &&
    passes.every((p) => p.name.trim().length > 0 && p.terms.length > 0 && p.terms.every((t) => t.field));
  const step4Valid = lawfulBasis.trim().length > 0 && dataOwner.trim().length > 0 && rejectAt <= matchAt;
  const nameValid = name.trim().length > 0;
  const allValid = nameValid && step1Valid && step2Valid && step3Valid && step4Valid;

  function buildBody(): CreateMatchProjectBody {
    if (!leftSource) {
      throw new Error('Match source is not fully configured');
    }
    return {
      name: name.trim(),
      description: description.trim() || undefined,
      mode: 'dedupe',
      leftSource,
      fieldMap,
      blockingPasses: passes.map(passDraftToBlockingPass),
      thresholds: { matchAt, rejectAt },
      columnAllowlist,
      lawfulBasis: lawfulBasis.trim(),
      dataOwner: dataOwner.trim(),
      retentionDays,
    };
  }

  /** Creates the draft project on first use, or syncs it with the latest wizard state thereafter. */
  async function saveDraft(): Promise<MatchProjectDto> {
    const body = buildBody();
    if (projectId) {
      return api.matching.updateProject(projectId, body);
    }
    const created = await api.matching.createProject(body);
    setProjectId(created.id);
    return created;
  }

  async function handleEstimate() {
    if (!allValid) {
      showToast('Complete every step (including step 4) before estimating', 'error');
      return;
    }
    setEstimating(true);
    setEstimateUnavailable(false);
    try {
      const project = await saveDraft();
      const result = await api.matching.estimate(project.id);
      setEstimate(result);
    } catch (err: unknown) {
      // Expected on a project's very first estimate: the blocking-key
      // histogram reads the workspace table `MaterializeService.materialize`
      // creates, and that table is only created during a run's own
      // materialize stage — there is no way to populate it ahead of one.
      // This is a real backend/frontend gap, not a bug in this handler;
      // see the task-16 report's Concerns section.
      setEstimate(null);
      setEstimateUnavailable(true);
    } finally {
      setEstimating(false);
    }
  }

  async function handleCreateAndRun() {
    if (!allValid) {
      showToast('Complete every step first', 'error');
      return;
    }
    if (estimate?.refused) {
      showToast('Refused: projected pairs exceed the safety cap. Narrow a blocking pass first.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const project = await saveDraft();
      await api.matching.startRun(project.id);
      showToast('Match project created and run started', 'success');
      router.push('/matching');
    } catch (err: any) {
      showToast(err.message || 'Failed to create match project', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Field map helpers ────────────────────────────────────────────────

  function toggleColumn(col: AvailableColumn) {
    setFieldMap((prev) => {
      const exists = prev.find((f) => f.left === col.name);
      if (exists) {
        return prev.filter((f) => f.left !== col.name);
      }
      const role: FieldRole = 'text';
      return [
        ...prev,
        { left: col.name, right: col.name, role, weight: 0.5, comparator: defaultComparatorFor(role) },
      ];
    });
  }

  function updateFieldRole(colName: string, role: FieldRole) {
    setFieldMap((prev) =>
      prev.map((f) => (f.left === colName ? { ...f, role, comparator: defaultComparatorFor(role) } : f)),
    );
  }

  function updateFieldWeight(colName: string, weight: number) {
    setFieldMap((prev) => prev.map((f) => (f.left === colName ? { ...f, weight } : f)));
  }

  // ── Blocking pass helpers ───────────────────────────────────────────

  function addPass() {
    setPasses((prev) => [
      ...prev,
      {
        name: `pass_${prev.length + 1}`,
        kind: 'equi',
        terms: [{ field: fieldMap[0]?.left ?? '', fn: 'none' }],
        threshold: 0.3,
      },
    ]);
    setEstimate(null);
    setEstimateUnavailable(false);
  }

  function removePass(index: number) {
    setPasses((prev) => prev.filter((_, i) => i !== index));
    setEstimate(null);
    setEstimateUnavailable(false);
  }

  function updatePass(index: number, patch: Partial<PassDraft>) {
    setPasses((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
    setEstimate(null);
    setEstimateUnavailable(false);
  }

  function addTerm(passIndex: number) {
    setPasses((prev) =>
      prev.map((p, i) =>
        i === passIndex ? { ...p, terms: [...p.terms, { field: fieldMap[0]?.left ?? '', fn: 'none' }] } : p,
      ),
    );
  }

  function removeTerm(passIndex: number, termIndex: number) {
    setPasses((prev) =>
      prev.map((p, i) => (i === passIndex ? { ...p, terms: p.terms.filter((_, ti) => ti !== termIndex) } : p)),
    );
  }

  function updateTerm(passIndex: number, termIndex: number, patch: Partial<KeyTerm>) {
    setPasses((prev) =>
      prev.map((p, i) =>
        i === passIndex
          ? { ...p, terms: p.terms.map((t, ti) => (ti === termIndex ? { ...t, ...patch } : t)) }
          : p,
      ),
    );
  }

  return (
    <div className="w-full">
      <PageHeader
        title="New match project"
        subtitle="Configure a matching problem: which data to compare, which fields, how strictly, and under what authority"
        icon={Users}
      />

      {/* Stepper */}
      <div className="bg-white rounded-xl border border-[#e8e8e8] shadow-card mb-4 px-6 py-4">
        <div className="flex items-center justify-between">
          {STEPS.map((s, index) => {
            const isCurrent = step === s.id;
            const isDoneCheck =
              [nameValid && step1Valid, step2Valid, step3Valid, step4Valid][s.id] ?? false;
            return (
              <div key={s.id} className="flex items-center flex-1">
                <button
                  onClick={() => setStep(s.id)}
                  className="flex items-center gap-2.5 text-left"
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors ${
                      isCurrent
                        ? 'border-[#1a1a1a] text-[#1a1a1a]'
                        : isDoneCheck
                          ? 'border-green-600 bg-green-600 text-white'
                          : 'border-[#dddddd] text-[#aaaaaa]'
                    }`}
                  >
                    {isDoneCheck && !isCurrent ? <Check className="h-4 w-4" /> : index + 1}
                  </div>
                  <span className={`text-sm font-medium ${isCurrent ? 'text-[#1a1a1a]' : 'text-[#777777]'}`}>
                    {s.label}
                  </span>
                </button>
                {index < STEPS.length - 1 && (
                  <ChevronRight className="h-4 w-4 mx-3 text-[#dddddd] shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step content */}
      <div className="bg-white rounded-xl border border-[#e8e8e8] shadow-card p-6 min-h-[420px]">
        {step === 0 && (
          <div className="space-y-5">
            <div>
              <Label htmlFor="project-name">Project name</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Citizen registry dedupe"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="project-description">Description (optional)</Label>
              <Input
                id="project-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1"
              />
            </div>

            <div className="pt-2 border-t border-[#f0f0f0]">
              <Label>Match Source</Label>
              <p className="text-xs text-[#aaaaaa] mt-0.5 mb-3">
                The one body of records this project compares against itself (phase 1 is dedupe-only).
              </p>
              <div className="flex gap-2 mb-4">
                <Button
                  type="button"
                  variant={sourceKind === 'connection' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setSourceKind('connection');
                    setStagedDataId('');
                    setPrimaryKey('');
                  }}
                >
                  Connection table
                </Button>
                <Button
                  type="button"
                  variant={sourceKind === 'staged' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setSourceKind('staged');
                    setConnectionId('');
                    setTableName('');
                    setSchemaName('');
                    setPrimaryKey('');
                  }}
                >
                  Staged dataset
                </Button>
              </div>

              {sourceKind === 'connection' && (
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="connection">Connection</Label>
                    <Select
                      value={connectionId}
                      onValueChange={(v) => {
                        setConnectionId(v);
                        setTableName('');
                        setSchemaName('');
                        setPrimaryKey('');
                      }}
                    >
                      <SelectTrigger id="connection" className="mt-1">
                        <SelectValue placeholder="Select a connection" />
                      </SelectTrigger>
                      <SelectContent>
                        {(connections ?? []).map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {connectionId && (
                    <div>
                      <Label>Table</Label>
                      {!tables ? (
                        <p className="text-sm text-[#aaaaaa] mt-1">Loading tables…</p>
                      ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-1 max-h-56 overflow-y-auto">
                          {tables.map((t) => {
                            const isSelected = t.name === tableName && t.schema === schemaName;
                            return (
                              <button
                                key={`${t.schema}.${t.name}`}
                                type="button"
                                onClick={() => {
                                  setTableName(t.name);
                                  setSchemaName(t.schema);
                                  setPrimaryKey('');
                                }}
                                className={`text-left p-2.5 rounded-lg border text-sm transition-colors ${
                                  isSelected
                                    ? 'border-[#1a1a1a] bg-[#f5f5f5]'
                                    : 'border-[#e8e8e8] hover:border-[#cccccc]'
                                }`}
                              >
                                <div className="font-medium text-[#1a1a1a] truncate">{t.name}</div>
                                <div className="text-xs text-[#aaaaaa]">{t.schema}</div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {sourceKind === 'staged' && (
                <div>
                  <Label>Staged dataset</Label>
                  {!stagedList ? (
                    <p className="text-sm text-[#aaaaaa] mt-1">Loading staged datasets…</p>
                  ) : stagedList.datasets.length === 0 ? (
                    <p className="text-sm text-[#aaaaaa] mt-1">No staged datasets available.</p>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-1 max-h-56 overflow-y-auto">
                      {stagedList.datasets.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => {
                            setStagedDataId(d.id);
                            setPrimaryKey('');
                          }}
                          className={`text-left p-2.5 rounded-lg border text-sm transition-colors ${
                            d.id === stagedDataId
                              ? 'border-[#1a1a1a] bg-[#f5f5f5]'
                              : 'border-[#e8e8e8] hover:border-[#cccccc]'
                          }`}
                        >
                          <div className="font-medium text-[#1a1a1a] truncate">{d.tableName}</div>
                          <div className="text-xs text-[#aaaaaa]">{d.rowCount.toLocaleString()} rows</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {availableColumns.length > 0 && (
                <div className="mt-4">
                  <Label htmlFor="primary-key">Primary key</Label>
                  <Select value={primaryKey} onValueChange={setPrimaryKey}>
                    <SelectTrigger id="primary-key" className="mt-1">
                      <SelectValue placeholder="Select the primary key column" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableColumns.map((c) => (
                        <SelectItem key={c.name} value={c.name}>
                          {c.name} ({c.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-[#1a1a1a]">Field map</h3>
              <p className="text-xs text-[#aaaaaa] mt-0.5">
                Choose which columns to compare, and how much each should count toward the match score.
                Entered by hand — phase 1 makes no model call here.
              </p>
            </div>

            {availableColumns.length === 0 ? (
              <p className="text-sm text-[#aaaaaa]">Pick a Match Source in step 1 first.</p>
            ) : (
              <div className="space-y-2">
                {availableColumns.map((col) => {
                  const mapping = fieldMap.find((f) => f.left === col.name);
                  const roleInfo = mapping ? FIELD_ROLES.find((r) => r.value === mapping.role) : null;
                  return (
                    <div
                      key={col.name}
                      className={`rounded-lg border p-3 transition-colors ${
                        mapping ? 'border-[#1a1a1a] bg-[#fafafa]' : 'border-[#e8e8e8]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={!!mapping}
                          onChange={() => toggleColumn(col)}
                          className="h-4 w-4"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-[#1a1a1a]">{col.name}</div>
                          <div className="text-xs text-[#aaaaaa]">{col.type}</div>
                        </div>
                        {mapping && (
                          <>
                            <Select
                              value={mapping.role}
                              onValueChange={(v) => updateFieldRole(col.name, v as FieldRole)}
                            >
                              <SelectTrigger className="w-44">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {FIELD_ROLES.map((r) => (
                                  <SelectItem key={r.value} value={r.value}>
                                    {r.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="w-32">
                              <Input
                                type="number"
                                min={0}
                                max={1}
                                step={0.05}
                                value={mapping.weight}
                                onChange={(e) => updateFieldWeight(col.name, parseFloat(e.target.value) || 0)}
                              />
                            </div>
                          </>
                        )}
                      </div>
                      {mapping && roleInfo && (
                        <p className="text-xs text-[#aaaaaa] mt-1.5 ml-7">{roleInfo.comparatorNote}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="pt-3 border-t border-[#f0f0f0]">
              <div className="text-xs font-medium text-[#555555] mb-1.5">
                Columns that will be copied out of the source (allow-list):
              </div>
              <div className="flex flex-wrap gap-1.5">
                {columnAllowlist.length === 0 ? (
                  <span className="text-xs text-[#aaaaaa]">None yet</span>
                ) : (
                  columnAllowlist.map((c) => (
                    <span
                      key={c}
                      className="text-xs px-2 py-0.5 rounded-full bg-[#f0f0f0] text-[#555555]"
                    >
                      {c}
                      {c === primaryKey ? ' (primary key)' : ''}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[#1a1a1a]">Blocking passes</h3>
                <p className="text-xs text-[#aaaaaa] mt-0.5">
                  A pass proposes which records are worth comparing, so the run never compares every
                  record against every other.
                </p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={addPass} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Add pass
              </Button>
            </div>

            {passes.length === 0 && (
              <p className="text-sm text-[#aaaaaa]">No blocking passes yet — add at least one.</p>
            )}

            <div className="space-y-3">
              {passes.map((pass, passIndex) => (
                <div key={passIndex} className="rounded-lg border border-[#e8e8e8] p-3 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Input
                      value={pass.name}
                      onChange={(e) => updatePass(passIndex, { name: e.target.value })}
                      placeholder="pass name"
                      className="w-48"
                    />
                    <Select
                      value={pass.kind}
                      onValueChange={(v) => updatePass(passIndex, { kind: v as BlockingKind })}
                    >
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="equi">Exact (equi)</SelectItem>
                        <SelectItem value="trigram">Trigram similarity</SelectItem>
                      </SelectContent>
                    </Select>
                    {pass.kind === 'trigram' && (
                      <div className="w-28">
                        <Input
                          type="number"
                          min={0}
                          max={1}
                          step={0.05}
                          value={pass.threshold}
                          onChange={(e) =>
                            updatePass(passIndex, { threshold: parseFloat(e.target.value) || 0 })
                          }
                          placeholder="threshold"
                        />
                      </div>
                    )}
                    <button
                      onClick={() => removePass(passIndex)}
                      className="ml-auto p-1.5 rounded text-[#aaaaaa] hover:text-red-600 hover:bg-red-50"
                      title="Remove pass"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="space-y-1.5 ml-1">
                    {pass.terms.map((term, termIndex) => (
                      <div key={termIndex} className="flex items-center gap-2">
                        {termIndex > 0 && <span className="text-xs text-[#aaaaaa]">then</span>}
                        <Select
                          value={term.field}
                          onValueChange={(v) => updateTerm(passIndex, termIndex, { field: v })}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue placeholder="field" />
                          </SelectTrigger>
                          <SelectContent>
                            {fieldMap.map((f) => (
                              <SelectItem key={f.left} value={f.left}>
                                {f.left}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={term.fn}
                          onValueChange={(v) => updateTerm(passIndex, termIndex, { fn: v as KeyFunction })}
                        >
                          <SelectTrigger className="w-52">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {KEY_FUNCTIONS.map((fn) => (
                              <SelectItem key={fn.value} value={fn.value}>
                                {fn.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {pass.terms.length > 1 && (
                          <button
                            onClick={() => removeTerm(passIndex, termIndex)}
                            className="p-1 rounded text-[#aaaaaa] hover:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={() => addTerm(passIndex)}
                      className="text-xs text-[#555555] hover:text-[#1a1a1a] flex items-center gap-1"
                    >
                      <Plus className="h-3 w-3" /> Add key term
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-[#f0f0f0]">
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleEstimate}
                  disabled={estimating || passes.length === 0}
                  className="gap-1.5"
                >
                  {estimating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Estimate
                </Button>
                {!allValid && (
                  <span className="text-xs text-[#aaaaaa]">
                    Fill in lawful basis and data owner (step 4) to run a live estimate.
                  </span>
                )}
              </div>

              {estimate && (
                <div className="mt-3 space-y-2">
                  {estimate.refused && (
                    <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <div>
                        Refused — projected pairs are more than twice the configured cap. Add or narrow a
                        blocking pass, then estimate again.
                      </div>
                    </div>
                  )}
                  {!estimate.refused && estimate.exceedsCap && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      Projected pairs exceed the configured cap — this run may be slow or refused.
                      Consider narrowing a blocking pass.
                    </div>
                  )}
                  <div className="space-y-1.5">
                    {estimate.perPass.map((p) => (
                      <div
                        key={p.pass}
                        className="flex items-center justify-between text-sm bg-[#f8f8f8] rounded px-3 py-2"
                      >
                        <span className="font-medium text-[#1a1a1a]">{p.pass}</span>
                        <span className="text-[#555555]">
                          {p.exact
                            ? `${p.estimatedPairs.toLocaleString()} pairs`
                            : `at least ${p.estimatedPairs.toLocaleString()} pairs (trigram — bound only, not a count)`}
                          {' · '}
                          {p.distinctKeys.toLocaleString()} distinct keys
                        </span>
                      </div>
                    ))}
                  </div>
                  {estimate.perPass.some((p) => p.droppedKeys.length > 0) && (
                    <div className="text-xs text-[#aaaaaa]">
                      Dropped degenerate keys (excluded from the projection, never compared):
                      {estimate.perPass
                        .filter((p) => p.droppedKeys.length > 0)
                        .map((p) => (
                          <div key={p.pass} className="mt-0.5">
                            <span className="font-medium">{p.pass}:</span> {p.droppedKeys.join(', ')}
                          </div>
                        ))}
                    </div>
                  )}
                  <div className="pt-2 border-t border-[#f0f0f0] flex items-center justify-between">
                    <span className="text-sm font-semibold text-[#1a1a1a]">Total</span>
                    <span className="text-sm font-semibold text-[#1a1a1a]">
                      {estimate.hasInexactPass
                        ? `at least ${estimate.totalEstimatedPairs.toLocaleString()} pairs`
                        : `${estimate.totalEstimatedPairs.toLocaleString()} pairs`}
                    </span>
                  </div>
                </div>
              )}

              {estimateUnavailable && (
                <div className="mt-3 rounded-md border border-[#e8e8e8] bg-[#fafafa] p-3 text-sm text-[#555555]">
                  This project hasn&apos;t run yet, so blocking can&apos;t be measured against real data
                  yet — the projection is computed from the workspace copy the first run creates. Once you
                  start a run, it computes this automatically and refuses safely if the projected volume is
                  too large for the configured cap.
                </div>
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-[#1a1a1a]">Thresholds</h3>
              <div className="mt-3 space-y-4">
                <div>
                  <Label>Match threshold (matchAt): {matchAt.toFixed(2)}</Label>
                  <Slider
                    min={0}
                    max={1}
                    step={0.01}
                    value={[matchAt]}
                    onValueChange={([v]) => {
                      setMatchAt(v);
                      setRejectAt((r) => Math.min(r, v));
                    }}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Reject threshold (rejectAt): {rejectAt.toFixed(2)}</Label>
                  <Slider
                    min={0}
                    max={1}
                    step={0.01}
                    value={[rejectAt]}
                    onValueChange={([v]) => setRejectAt(Math.min(v, matchAt))}
                    className="mt-2"
                  />
                </div>
              </div>
              <p className="text-xs text-[#777777] mt-3 leading-relaxed">
                Scores are a weighted average across every mapped field&apos;s weight — not just the
                fields present on a given pair. A pair missing a field can never score above 1 minus that
                field&apos;s weight share, however well the rest agree. If phone carries weight 0.2 and a
                pair has no phone on either side, it caps at 0.8 and can never reach a 0.9 match threshold.
                Set thresholds using the precision and recall you measure against a gold set, not by
                assuming every field is always populated.
              </p>
            </div>

            <div className="pt-4 border-t border-[#f0f0f0]">
              <h3 className="text-sm font-semibold text-[#1a1a1a]">Authority</h3>
              <p className="text-xs text-[#aaaaaa] mt-0.5 mb-3">
                Required. This is the recorded legal justification for copying this data, and the person
                accountable for it — both stay attached to every decision and cluster this project ever
                produces.
              </p>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="lawful-basis">Lawful basis</Label>
                  <Input
                    id="lawful-basis"
                    value={lawfulBasis}
                    onChange={(e) => setLawfulBasis(e.target.value)}
                    placeholder="e.g. Consent under Article 6(1)(a)"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="data-owner">Data owner</Label>
                  <Input
                    id="data-owner"
                    value={dataOwner}
                    onChange={(e) => setDataOwner(e.target.value)}
                    placeholder="e.g. registry-team@example.gov"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="retention-days">Retention (days)</Label>
                  <Input
                    id="retention-days"
                    type="number"
                    min={1}
                    max={365}
                    value={retentionDays}
                    onChange={(e) => setRetentionDays(parseInt(e.target.value, 10) || 1)}
                    className="mt-1 w-32"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer navigation */}
      <div className="mt-4 flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          Back
        </Button>
        {step < 3 ? (
          <Button type="button" onClick={() => setStep((s) => Math.min(3, s + 1))}>
            Next
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleCreateAndRun}
            disabled={!allValid || submitting || estimate?.refused === true}
            className="gap-1.5"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Create and run
          </Button>
        )}
      </div>
    </div>
  );
}
