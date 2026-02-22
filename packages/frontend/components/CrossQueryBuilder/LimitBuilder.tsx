'use client';

import { QueryDefinition } from '@/types';

interface LimitBuilderProps {
  queryDefinition: QueryDefinition;
  onQueryChange: (definition: QueryDefinition) => void;
}

export function LimitBuilder({
  queryDefinition,
  onQueryChange,
}: LimitBuilderProps) {
  const handleLimitChange = (value: string) => {
    const numValue = parseInt(value, 10);
    onQueryChange({
      ...queryDefinition,
      limit: isNaN(numValue) || numValue <= 0 ? undefined : numValue,
    });
  };

  const presetLimits = [10, 50, 100, 500, 1000, 5000];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label htmlFor="limit-input" className="text-sm font-medium text-gray-700">
          Row Limit:
        </label>
        <input
          id="limit-input"
          type="number"
          min="1"
          value={queryDefinition.limit || ''}
          onChange={(e) => handleLimitChange(e.target.value)}
          placeholder="No limit"
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Preset Buttons */}
      <div className="flex flex-wrap gap-2">
        {presetLimits.map((preset) => (
          <button
            key={preset}
            onClick={() => handleLimitChange(preset.toString())}
            className={`px-3 py-1 text-xs font-medium rounded border transition-colors ${
              queryDefinition.limit === preset
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {preset.toLocaleString()}
          </button>
        ))}
        {queryDefinition.limit && (
          <button
            onClick={() => handleLimitChange('')}
            className="px-3 py-1 text-xs font-medium rounded border border-gray-300 text-red-600 hover:bg-red-50"
          >
            Clear
          </button>
        )}
      </div>

      {/* Current Status */}
      <div className="text-xs text-gray-600 pt-2 border-t">
        {queryDefinition.limit ? (
          <>Limiting results to <span className="font-semibold">{queryDefinition.limit.toLocaleString()}</span> rows</>
        ) : (
          'No limit - all matching rows will be returned'
        )}
      </div>

      {/* Warning for no limit */}
      {!queryDefinition.limit && (
        <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          ⚠️ Without a limit, large result sets may take time to load
        </div>
      )}
    </div>
  );
}
