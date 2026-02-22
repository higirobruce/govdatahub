'use client';

import { useState } from 'react';
import { JoinDefinition, TableReference, JoinCondition } from '@/types';
import { useToast } from '@/components/ui/toast';

interface JoinConfigDialogProps {
  join: JoinDefinition;
  tables: TableReference[];
  onSave: (join: JoinDefinition) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function JoinConfigDialog({
  join,
  tables,
  onSave,
  onDelete,
  onClose,
}: JoinConfigDialogProps) {
  const { showToast } = useToast();
  const [editedJoin, setEditedJoin] = useState<JoinDefinition>(join);

  const leftTable = tables.find((t) => t.alias === join.leftTable);
  const rightTable = tables.find((t) => t.alias === join.rightTable);

  const handleAddCondition = () => {
    setEditedJoin({
      ...editedJoin,
      conditions: [
        ...editedJoin.conditions,
        {
          leftColumn: '',
          operator: '=',
          rightColumn: '',
        },
      ],
    });
  };

  const handleUpdateCondition = (index: number, field: keyof JoinCondition, value: any) => {
    const newConditions = [...editedJoin.conditions];
    newConditions[index] = {
      ...newConditions[index],
      [field]: value,
    };
    setEditedJoin({
      ...editedJoin,
      conditions: newConditions,
    });
  };

  const handleRemoveCondition = (index: number) => {
    if (editedJoin.conditions.length === 1) {
      showToast('At least one condition is required', 'warning');
      return;
    }
    setEditedJoin({
      ...editedJoin,
      conditions: editedJoin.conditions.filter((_, i) => i !== index),
    });
  };

  const handleSave = () => {
    // Validate that all conditions have values
    const isValid = editedJoin.conditions.every(
      (c) => c.leftColumn && c.rightColumn
    );

    if (!isValid) {
      showToast('Please fill in all join conditions', 'warning');
      return;
    }

    onSave(editedJoin);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Configure Join</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            {leftTable?.alias} → {rightTable?.alias}
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {/* Join Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Join Type
            </label>
            <select
              value={editedJoin.type}
              onChange={(e) =>
                setEditedJoin({
                  ...editedJoin,
                  type: e.target.value as JoinDefinition['type'],
                })
              }
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-[#1a1a1a] focus:border-[#1a1a1a]"
            >
              <option value="INNER">INNER JOIN</option>
              <option value="LEFT">LEFT JOIN</option>
              <option value="RIGHT">RIGHT JOIN</option>
              <option value="FULL">FULL OUTER JOIN</option>
            </select>
          </div>

          {/* Join Conditions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Join Conditions
              </label>
              <button
                onClick={handleAddCondition}
                className="text-sm text-[#1a1a1a] hover:text-[#2a2a2a] font-medium"
              >
                + Add Condition
              </button>
            </div>

            <div className="space-y-3">
              {editedJoin.conditions.map((condition, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 p-3 bg-gray-50 rounded-md"
                >
                  {/* Left Column */}
                  <select
                    value={condition.leftColumn}
                    onChange={(e) =>
                      handleUpdateCondition(index, 'leftColumn', e.target.value)
                    }
                    className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded"
                  >
                    <option value="">Select column</option>
                    {leftTable?.columns?.map((col) => (
                      <option key={col.name} value={col.name}>
                        {leftTable.alias}.{col.name}
                      </option>
                    ))}
                  </select>

                  {/* Operator */}
                  <select
                    value={condition.operator}
                    onChange={(e) =>
                      handleUpdateCondition(index, 'operator', e.target.value)
                    }
                    className="w-16 px-2 py-1 text-sm border border-gray-300 rounded"
                  >
                    <option value="=">=</option>
                    <option value="!=">!=</option>
                    <option value=">">{'>'}</option>
                    <option value="<">{'<'}</option>
                    <option value=">=">{'>='}</option>
                    <option value="<=">{'<='}</option>
                  </select>

                  {/* Right Column */}
                  <select
                    value={condition.rightColumn}
                    onChange={(e) =>
                      handleUpdateCondition(index, 'rightColumn', e.target.value)
                    }
                    className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded"
                  >
                    <option value="">Select column</option>
                    {rightTable?.columns?.map((col) => (
                      <option key={col.name} value={col.name}>
                        {rightTable.alias}.{col.name}
                      </option>
                    ))}
                  </select>

                  {/* Remove Button */}
                  <button
                    onClick={() => handleRemoveCondition(index)}
                    className="text-red-600 hover:text-red-700"
                    disabled={editedJoin.conditions.length === 1}
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <button
            onClick={onDelete}
            className="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 border border-red-300 rounded-md hover:bg-red-50"
          >
            Delete Join
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm font-medium text-white bg-[#1a1a1a] hover:bg-[#2a2a2a] rounded-md"
            >
              Save Join
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
