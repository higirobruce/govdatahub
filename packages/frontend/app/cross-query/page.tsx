'use client';

import { useState } from 'react';
import { QueryDefinition, CrossQueryResult } from '@/types/cross-query';
import { ConnectionSelector } from '@/components/CrossQueryBuilder/ConnectionSelector';
import { TableBrowser } from '@/components/CrossQueryBuilder/TableBrowser';
import { VisualJoinEditor } from '@/components/CrossQueryBuilder/VisualJoinEditor';
import { ColumnSelector } from '@/components/CrossQueryBuilder/ColumnSelector';
import { QueryPreview } from '@/components/CrossQueryBuilder/QueryPreview';
import { ResultsViewer } from '@/components/CrossQueryBuilder/ResultsViewer';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Play, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';

export default function CrossQueryPage() {
  const [selectedConnections, setSelectedConnections] = useState<string[]>([]);
  const [queryDefinition, setQueryDefinition] = useState<QueryDefinition>({
    tables: [],
    joins: [],
    columns: [],
    filters: [],
    orderBy: [],
    limit: 100,
  });
  const [result, setResult] = useState<CrossQueryResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExecute = async () => {
    // Validate query has required components
    if (queryDefinition.tables.length === 0) {
      setError('Please add at least one table');
      return;
    }

    if (queryDefinition.columns.length === 0) {
      setError('Please select at least one column');
      return;
    }

    if (queryDefinition.tables.length > 1 && queryDefinition.joins.length === 0) {
      setError('Multiple tables require joins');
      return;
    }

    setError(null);
    setIsExecuting(true);

    try {
      const response = await api.crossQuery.execute({ queryDefinition });
      setResult(response as CrossQueryResult);
    } catch (err: any) {
      setError(err.message || 'Failed to execute query');
      setResult(null);
    } finally {
      setIsExecuting(false);
    }
  };

  const canExecute =
    queryDefinition.tables.length > 0 &&
    queryDefinition.columns.length > 0 &&
    (queryDefinition.tables.length === 1 || queryDefinition.joins.length > 0);

  return (
    <div className="container mx-auto px-4 py-6 max-w-full h-screen flex flex-col">
      {/* Header - Compact */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Cross-Database Query Builder</h1>
        <p className="text-sm text-muted-foreground">
          Join data from multiple databases using a visual query builder
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Main Content - Fill remaining height */}
      <div className="grid grid-cols-12 gap-4 flex-1 min-h-0">
        {/* Left Sidebar - Narrower */}
        <div className="col-span-2 space-y-3 overflow-y-auto">
          <Card className="p-3">
            <h2 className="text-sm font-semibold mb-3">Connections</h2>
            <ConnectionSelector
              selectedConnections={selectedConnections}
              onSelectionChange={setSelectedConnections}
            />
          </Card>

          {selectedConnections.length > 0 && (
            <Card className="p-3">
              <h2 className="text-sm font-semibold mb-3">Tables</h2>
              <TableBrowser
                connectionIds={selectedConnections}
                queryDefinition={queryDefinition}
                onQueryChange={setQueryDefinition}
              />
            </Card>
          )}

          <Card className="p-3">
            <h2 className="text-sm font-semibold mb-3">Query Options</h2>
            <div className="space-y-3 text-xs">
              <div>
                <label className="text-xs font-medium">Result Limit</label>
                <input
                  type="number"
                  value={queryDefinition.limit || 100}
                  onChange={(e) =>
                    setQueryDefinition({
                      ...queryDefinition,
                      limit: parseInt(e.target.value) || 100,
                    })
                  }
                  className="w-full px-2 py-1 border rounded text-xs mt-1"
                  min="1"
                  max="10000"
                />
              </div>

              {queryDefinition.tables.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div>Tables: {queryDefinition.tables.length}</div>
                    <div>Joins: {queryDefinition.joins.length}</div>
                    <div>Columns: {queryDefinition.columns.length}</div>
                  </div>

                  {/* Join List - Compact */}
                  {queryDefinition.joins.length > 0 && (
                    <div className="pt-2 border-t">
                      <h3 className="text-xs font-semibold mb-1">Joins</h3>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {queryDefinition.joins.map((join, index) => (
                          <div
                            key={index}
                            className="text-xs bg-muted p-1.5 rounded space-y-0.5"
                          >
                            <div className="font-medium truncate">
                              {join.leftTable} {join.type} {join.rightTable}
                            </div>
                            {join.conditions.map((cond, condIndex) => (
                              <div key={condIndex} className="text-muted-foreground truncate">
                                {cond.leftColumn} {cond.operator} {cond.rightColumn}
                              </div>
                            ))}
                            <button
                              onClick={() => {
                                const newJoins = queryDefinition.joins.filter((_, i) => i !== index);
                                setQueryDefinition({ ...queryDefinition, joins: newJoins });
                              }}
                              className="text-destructive hover:underline text-xs"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Center - Query Configuration - Wider */}
        <div className="col-span-10 flex flex-col space-y-3 min-h-0">
          {/* Visual Join Editor - Takes most space */}
          {queryDefinition.tables.length > 0 && (
            <Card className="p-3 flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold">
                  Table Relationships
                  {queryDefinition.tables.length > 1 && (
                    <span className="text-xs font-normal text-muted-foreground ml-2">
                      Drag between columns to create joins
                    </span>
                  )}
                </h2>
                {queryDefinition.columns.length > 0 && (
                  <Button
                    onClick={handleExecute}
                    disabled={!canExecute || isExecuting}
                    size="sm"
                    className="gap-2"
                  >
                    {isExecuting ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Executing...
                      </>
                    ) : (
                      <>
                        <Play className="h-3 w-3" />
                        Execute Query
                      </>
                    )}
                  </Button>
                )}
              </div>
              <div className="flex-1 min-h-0">
                <VisualJoinEditor
                  queryDefinition={queryDefinition}
                  onQueryChange={setQueryDefinition}
                />
              </div>
            </Card>
          )}

          {/* Bottom Section - Compact */}
          <div className="grid grid-cols-2 gap-3 max-h-[calc(50vh-120px)]">
            {/* Column Selection - Compact */}
            {queryDefinition.tables.length > 0 && (
              <Card className="p-3 overflow-y-auto">
                <h2 className="text-sm font-semibold mb-2">Select Columns</h2>
                <ColumnSelector
                  queryDefinition={queryDefinition}
                  onQueryChange={setQueryDefinition}
                />
              </Card>
            )}

            {/* Query Preview - Compact */}
            {queryDefinition.tables.length > 0 && queryDefinition.columns.length > 0 && (
              <Card className="p-3 overflow-y-auto">
                <h2 className="text-sm font-semibold mb-2">Query Preview</h2>
                <QueryPreview queryDefinition={queryDefinition} />
              </Card>
            )}
          </div>

          {/* Results - Full width when visible */}
          {result && (
            <Card className="p-3 max-h-64 overflow-auto flex flex-col">
              <ResultsViewer result={result} />
            </Card>
          )}
        </div>

        
      </div>
    </div>
  );
}
