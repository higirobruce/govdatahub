'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowRight, Database } from 'lucide-react';

export interface ColumnMappingData {
  sourceColumns: Array<{ name: string; type: string; sample: any }>;
  targetColumns?: Array<{ name: string; type: string; nullable: boolean }>;
}

interface ColumnMappingProps {
  data: ColumnMappingData;
  onMappingChange: (mapping: Record<string, string>) => void;
  targetConnection?: any;
}

export function ColumnMapping({
  data,
  onMappingChange,
  targetConnection,
}: ColumnMappingProps) {
  const [mapping, setMapping] = useState<Record<string, string>>({});

  const handleMappingChange = (sourceColumn: string, targetColumn: string) => {
    const newMapping = { ...mapping, [sourceColumn]: targetColumn };
    setMapping(newMapping);
    onMappingChange(newMapping);
  };

  const handleAutoMap = () => {
    if (!data.targetColumns) return;

    const autoMapping: Record<string, string> = {};

    // Try exact name matches first
    data.sourceColumns.forEach((sourceCol) => {
      const exactMatch = data.targetColumns?.find(
        (targetCol) => targetCol.name.toLowerCase() === sourceCol.name.toLowerCase()
      );

      if (exactMatch) {
        autoMapping[sourceCol.name] = exactMatch.name;
      }
    });

    setMapping(autoMapping);
    onMappingChange(autoMapping);
  };

  const mappedCount = Object.keys(mapping).length;
  const totalCount = data.sourceColumns.length;

  return (
    <div className="space-y-6">
      {/* Mapping Summary */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Database className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Column Mapping</p>
                <p className="text-lg font-semibold">
                  {mappedCount} of {totalCount} columns mapped
                </p>
              </div>
            </div>

            {data.targetColumns && (
              <Button onClick={handleAutoMap} variant="outline">
                Auto Map
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Column Mapping Table */}
      <Card>
        <CardHeader>
          <CardTitle>Map Source Columns to Target</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.sourceColumns.map((sourceCol) => (
              <div
                key={sourceCol.name}
                className="flex items-center gap-4 p-4 rounded-lg border bg-card"
              >
                {/* Source Column */}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div>
                      <p className="font-semibold">{sourceCol.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {sourceCol.type}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          Sample: {JSON.stringify(sourceCol.sample)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Arrow */}
                <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />

                {/* Target Column Selector */}
                <div className="flex-1">
                  {data.targetColumns ? (
                    <Select
                      value={mapping[sourceCol.name] || ''}
                      onValueChange={(value) =>
                        handleMappingChange(sourceCol.name, value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select target column" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__skip__">
                          <span className="text-muted-foreground italic">
                            Skip this column
                          </span>
                        </SelectItem>
                        {data.targetColumns.map((targetCol) => (
                          <SelectItem key={targetCol.name} value={targetCol.name}>
                            <div className="flex items-center gap-2">
                              <span>{targetCol.name}</span>
                              <Badge variant="outline" className="text-xs">
                                {targetCol.type}
                              </Badge>
                              {!targetCol.nullable && (
                                <Badge variant="destructive" className="text-xs">
                                  Required
                                </Badge>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="p-3 bg-muted rounded-md">
                      <p className="text-sm text-muted-foreground">
                        Will create new column: <strong>{sourceCol.name}</strong>
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Type: {sourceCol.type}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {mappedCount < totalCount && (
            <div className="mt-6 p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">
                💡 Unmapped columns will be skipped during import. Use "Auto Map" to
                automatically match columns by name.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
