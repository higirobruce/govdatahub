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
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Cross-Database Query Builder</h1>
        <p className="text-muted-foreground mt-2">
          Join data from multiple databases using a visual query builder
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-12 gap-6">
        {/* Left Sidebar - Connection & Table Selection */}
        <div className="col-span-3 space-y-4">
          <Card className="p-4">
            <h2 className="text-lg font-semibold mb-4">Connections</h2>
            <ConnectionSelector
              selectedConnections={selectedConnections}
              onSelectionChange={setSelectedConnections}
            />
          </Card>

          {selectedConnections.length > 0 && (
            <Card className="p-4">
              <h2 className="text-lg font-semibold mb-4">Tables</h2>
              <TableBrowser
                connectionIds={selectedConnections}
                queryDefinition={queryDefinition}
                onQueryChange={setQueryDefinition}
              />
            </Card>
          )}

          <Card className="p-4">
            <h2 className="text-lg font-semibold mb-4">Query Options</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Result Limit</label>
                <input
                  type="number"
                  value={queryDefinition.limit || 100}
                  onChange={(e) =>
                    setQueryDefinition({
                      ...queryDefinition,
                      limit: parseInt(e.target.value) || 100,
                    })
                  }
                  className="w-full px-3 py-2 border rounded-md mt-1"
                  min="1"
                  max="10000"
                />
              </div>

              {queryDefinition.tables.length > 0 && (
                <div className="space-y-4">
                  <div className="text-sm text-muted-foreground space-y-2">
                    <div>
                      <strong>Tables:</strong> {queryDefinition.tables.length}
                    </div>
                    <div>
                      <strong>Joins:</strong> {queryDefinition.joins.length}
                    </div>
                    <div>
                      <strong>Columns:</strong> {queryDefinition.columns.length}
                    </div>
                  </div>

                  {/* Join List */}
                  {queryDefinition.joins.length > 0 && (
                    <div className="pt-4 border-t">
                      <h3 className="text-sm font-semibold mb-2">Configured Joins</h3>
                      <div className="space-y-2">
                        {queryDefinition.joins.map((join, index) => (
                          <div
                            key={index}
                            className="text-xs bg-muted p-2 rounded-md space-y-1"
                          >
                            <div className="font-medium">
                              {join.leftTable} {join.type} {join.rightTable}
                            </div>
                            {join.conditions.map((cond, condIndex) => (
                              <div key={condIndex} className="text-muted-foreground">
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

        {/* Center - Query Configuration */}
        <div className="col-span-9 space-y-4">
          {/* Visual Join Editor */}
          {queryDefinition.tables.length > 0 && (
            <Card className="p-4">
              <h2 className="text-lg font-semibold mb-4">
                Table Relationships
                {queryDefinition.tables.length > 1 && (
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    Drag between columns to create joins
                  </span>
                )}
              </h2>
              <VisualJoinEditor
                queryDefinition={queryDefinition}
                onQueryChange={setQueryDefinition}
              />
            </Card>
          )}

          {/* Column Selection */}
          {queryDefinition.tables.length > 0 && (
            <Card className="p-4">
              <h2 className="text-lg font-semibold mb-4">Select Columns</h2>
              <ColumnSelector
                queryDefinition={queryDefinition}
                onQueryChange={setQueryDefinition}
              />
            </Card>
          )}

          {/* Query Preview */}
          {queryDefinition.tables.length > 0 && queryDefinition.columns.length > 0 && (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Query Preview</h2>
                <Button
                  onClick={handleExecute}
                  disabled={!canExecute || isExecuting}
                  className="gap-2"
                >
                  {isExecuting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Executing...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      Execute Query
                    </>
                  )}
                </Button>
              </div>
              <QueryPreview queryDefinition={queryDefinition} />
            </Card>
          )}

          {/* Results */}
          {result && (
            <Card className="p-4">
              <ResultsViewer result={result} />
            </Card>
          )}
        </div>

        
      </div>
    </div>
  );
}
