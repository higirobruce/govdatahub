'use client';

export type ProductStatus = 'draft' | 'validated' | 'active' | 'deprecated' | 'decommissioned';

const CONFIG: Record<ProductStatus, { label: string; className: string }> = {
  draft:          { label: 'Draft',          className: 'bg-gray-100 text-gray-700 border-gray-300' },
  validated:      { label: 'Validated',      className: 'bg-blue-100 text-blue-700 border-blue-300' },
  active:         { label: 'Active',         className: 'bg-green-100 text-green-700 border-green-300' },
  deprecated:     { label: 'Deprecated',     className: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  decommissioned: { label: 'Decommissioned', className: 'bg-red-100 text-red-700 border-red-300' },
};

// What transitions are allowed from each state
export const NEXT_STATES: Record<ProductStatus, ProductStatus[]> = {
  draft:          ['validated'],
  validated:      ['active', 'draft'],
  active:         ['deprecated'],
  deprecated:     ['decommissioned'],
  decommissioned: [],
};

export const TRANSITION_LABELS: Record<ProductStatus, string> = {
  draft:          'Send for Validation',
  validated:      'Publish',
  active:         'Deprecate',
  deprecated:     'Decommission',
  decommissioned: '',
};

export function LifecycleBadge({ status }: { status: ProductStatus }) {
  const cfg = CONFIG[status] ?? CONFIG.draft;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}
