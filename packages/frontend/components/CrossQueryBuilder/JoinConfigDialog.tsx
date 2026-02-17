'use client';

import { useState } from 'react';
import { JoinDefinition, JoinType, JoinOperator, JoinCondition } from '@/types/cross-query';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { X, Plus } from 'lucide-react';

interface JoinConfigDialogProps {
  leftTable: string;
  leftColumn: string;
  rightTable: string;
  rightColumn: string;
  existingJoin?: JoinDefinition;
  onSave: (join: JoinDefinition) => void;
  onCancel: () => void;
}

export function JoinConfigDialog({
  leftTable,
  leftColumn,
  rightTable,
  rightColumn,
  existingJoin,
  onSave,
  onCancel,
}: JoinConfigDialogProps) {
  const [joinType, setJoinType] = useState<JoinType>(existingJoin?.type || 'INNER');
  const [conditions, setConditions] = useState<JoinCondition[]>(
    existingJoin?.conditions || [
      {
        leftColumn,
        operator: '=',
        rightColumn,
      },
    ]
  );

  const addCondition = () => {
    setConditions([
      ...conditions,
      {
        leftColumn: '',
        operator: '=',
        rightColumn: '',
      },
    ]);
  };

  const removeCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const updateCondition = (index: number, field: keyof JoinCondition, value: string) => {
    const newConditions = [...conditions];
    newConditions[index] = { ...newConditions[index], [field]: value };
    setConditions(newConditions);
  };

  const handleSave = () => {
    const join: JoinDefinition = {
      type: joinType,
      leftTable,
      rightTable,
      conditions,
    };
    onSave(join);
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-card border rounded-lg shadow-lg p-6 max-w-2xl w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Configure Join</h2>
          <Button variant="ghost" size="sm" onClick={onCancel} className="h-8 w-8 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4">
          {/* Join Type */}
          <div>
            <Label>Join Type</Label>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {(['INNER', 'LEFT', 'RIGHT', 'FULL'] as JoinType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setJoinType(type)}
                  className={`px-4 py-2 rounded-md border text-sm font-medium transition-colors ${
                    joinType === type
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-border hover:bg-accent'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Tables Info */}
          <div className="bg-muted p-3 rounded-md text-sm">
            <div className="font-medium">
              {leftTable} {joinType} JOIN {rightTable}
            </div>
          </div>

          {/* Conditions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Join Conditions</Label>
              <Button variant="outline" size="sm" onClick={addCondition} className="h-8 gap-1">
                <Plus className="h-3 w-3" />
                Add Condition
              </Button>
            </div>

            <div className="space-y-2">
              {conditions.map((condition, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={condition.leftColumn}
                    onChange={(e) => updateCondition(index, 'leftColumn', e.target.value)}
                    placeholder={`${leftTable}.column`}
                    className="flex-1 px-3 py-2 border rounded-md text-sm"
                  />

                  <select
                    value={condition.operator}
                    onChange={(e) =>
                      updateCondition(index, 'operator', e.target.value as JoinOperator)
                    }
                    className="px-3 py-2 border rounded-md text-sm"
                  >
                    <option value="=">=</option>
                    <option value="!=">!=</option>
                    <option value=">">&gt;</option>
                    <option value="<">&lt;</option>
                    <option value=">=">&gt;=</option>
                    <option value="<=">&lt;=</option>
                  </select>

                  <input
                    type="text"
                    value={condition.rightColumn}
                    onChange={(e) => updateCondition(index, 'rightColumn', e.target.value)}
                    placeholder={`${rightTable}.column`}
                    className="flex-1 px-3 py-2 border rounded-md text-sm"
                  />

                  {conditions.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeCondition(index)}
                      className="h-9 w-9 p-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save Join</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
