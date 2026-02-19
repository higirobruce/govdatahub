'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  Database,
  ArrowRight,
  ArrowLeft,
  Eye,
  MapPin,
  Play,
  Download,
  X,
} from 'lucide-react';

type Step = 'upload' | 'preview' | 'mapping' | 'target' | 'progress';

export default function DataIngestionPage() {
  const [currentStep, setCurrentStep] = useState<Step>('upload');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  // Mock data for preview
  const mockPreviewData = {
    columns: ['id', 'firstName', 'lastName', 'email', 'dateOfBirth', 'status'],
    rows: [
      ['1', 'John', 'Doe', 'john@example.com', '1990-05-15', 'active'],
      ['2', 'Jane', 'Smith', 'jane@example.com', '1985-08-22', 'active'],
      ['3', 'Bob', 'Johnson', 'bob@example.com', '1992-03-10', 'inactive'],
      ['4', 'Alice', 'Williams', 'alice@example.com', '1988-11-30', 'active'],
      ['5', 'Charlie', 'Brown', 'charlie@example.com', '1995-07-18', 'active'],
    ],
    totalRows: 125000,
    fileSize: '12.5 MB',
    fileType: 'CSV',
  };

  const mockErrors = [
    {
      row: 42,
      column: 'email',
      value: 'invalid-email',
      error: 'Invalid email format',
      errorType: 'VALIDATION_ERROR',
      suggestion: 'Expected format: user@domain.com',
      severity: 'error'
    },
    {
      row: 156,
      column: 'dateOfBirth',
      value: '99/99/9999',
      error: 'Invalid date format',
      errorType: 'TYPE_MISMATCH',
      suggestion: 'Expected format: YYYY-MM-DD',
      severity: 'error'
    },
    {
      row: 1023,
      column: 'status',
      value: 'unknown',
      error: 'Value not in allowed list',
      errorType: 'CONSTRAINT_VIOLATION',
      suggestion: 'Allowed values: active, inactive, pending',
      severity: 'error'
    },
    {
      row: 2341,
      column: 'age',
      value: '-5',
      error: 'Value out of valid range',
      errorType: 'CONSTRAINT_VIOLATION',
      suggestion: 'Age must be between 0 and 150',
      severity: 'error'
    },
    {
      row: 3456,
      column: 'phone',
      value: '123',
      error: 'Incomplete phone number',
      errorType: 'VALIDATION_ERROR',
      suggestion: 'Expected 10 digits',
      severity: 'warning'
    },
    {
      row: 5678,
      column: 'firstName',
      value: '',
      error: 'Required field is empty',
      errorType: 'MISSING_VALUE',
      suggestion: 'This field cannot be null or empty',
      severity: 'error'
    },
    {
      row: 7890,
      column: 'postalCode',
      value: 'ABC123',
      error: 'Invalid postal code format',
      errorType: 'VALIDATION_ERROR',
      suggestion: 'Expected 5 digits or 9 digits with hyphen',
      severity: 'warning'
    },
  ];

  // Error statistics for better overview
  const errorStats = {
    total: mockErrors.length,
    byType: {
      VALIDATION_ERROR: 4,
      TYPE_MISMATCH: 1,
      CONSTRAINT_VIOLATION: 2,
      MISSING_VALUE: 1,
    },
    bySeverity: {
      error: 5,
      warning: 2,
    },
    byColumn: {
      email: 1,
      dateOfBirth: 1,
      status: 1,
      age: 1,
      phone: 1,
      firstName: 1,
      postalCode: 1,
    },
  };

  const steps = [
    { id: 'upload', label: 'Upload File', icon: Upload },
    { id: 'preview', label: 'Preview Data', icon: Eye },
    { id: 'mapping', label: 'Map Columns', icon: MapPin },
    { id: 'target', label: 'Choose Target', icon: Database },
    { id: 'progress', label: 'Import', icon: Play },
  ];

  const renderStepIndicator = () => (
    <div className="flex items-center justify-between mb-8">
      {steps.map((step, index) => {
        const StepIcon = step.icon;
        const isActive = step.id === currentStep;
        const isCompleted = steps.findIndex(s => s.id === currentStep) > index;

        return (
          <div key={step.id} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  isCompleted
                    ? 'bg-green-500 text-white'
                    : isActive
                    ? 'bg-primary text-white'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : <StepIcon className="h-5 w-5" />}
              </div>
              <span className={`text-xs mt-2 ${isActive ? 'font-semibold' : 'text-muted-foreground'}`}>
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={`h-0.5 flex-1 mx-2 ${
                  isCompleted ? 'bg-green-500' : 'bg-muted'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );

  const renderUploadStep = () => (
    <Card className="p-8">
      <h2 className="text-xl font-semibold mb-4">Upload Data File</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Upload CSV, Excel, JSON, or Parquet files. Maximum file size: 100MB.
      </p>

      {/* Drag & Drop Area */}
      <div className="border-2 border-dashed border-muted rounded-lg p-12 text-center hover:border-primary hover:bg-accent/50 transition-colors cursor-pointer">
        <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-medium mb-2">Drag & drop your file here</h3>
        <p className="text-sm text-muted-foreground mb-4">or</p>
        <Button>Browse Files</Button>
      </div>

      {/* Supported Formats */}
      <div className="mt-6 grid grid-cols-4 gap-4">
        {['CSV', 'Excel (XLSX)', 'JSON', 'Parquet'].map((format) => (
          <div key={format} className="flex items-center gap-2 p-3 border rounded-md">
            <FileText className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">{format}</span>
          </div>
        ))}
      </div>

      {/* Recent Uploads */}
      <div className="mt-8">
        <h3 className="text-sm font-semibold mb-3">Recent Imports</h3>
        <div className="space-y-2">
          {[
            { name: 'citizens_2024.csv', date: '2 hours ago', status: 'completed', rows: '125,000' },
            { name: 'vehicles_jan.xlsx', date: '1 day ago', status: 'completed', rows: '45,230' },
            { name: 'licenses_data.json', date: '3 days ago', status: 'failed', rows: '-' },
          ].map((file) => (
            <div key={file.name} className="flex items-center justify-between p-3 border rounded-md hover:bg-accent">
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">{file.name}</div>
                  <div className="text-xs text-muted-foreground">{file.date} • {file.rows} rows</div>
                </div>
              </div>
              <span
                className={`text-xs px-2 py-1 rounded ${
                  file.status === 'completed'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {file.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );

  const renderPreviewStep = () => (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold">Preview Data</h2>
            <p className="text-sm text-muted-foreground">
              Showing first 5 of {mockPreviewData.totalRows.toLocaleString()} rows
            </p>
          </div>
          <div className="flex gap-3 text-sm">
            <div className="px-3 py-1 bg-primary/10 text-primary rounded-md">
              {mockPreviewData.fileType}
            </div>
            <div className="px-3 py-1 bg-muted rounded-md">{mockPreviewData.fileSize}</div>
          </div>
        </div>

        {/* Data Preview Table */}
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">#</th>
                  {mockPreviewData.columns.map((col) => (
                    <th key={col} className="px-4 py-2 text-left font-medium">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mockPreviewData.rows.map((row, idx) => (
                  <tr key={idx} className="border-t hover:bg-accent/50">
                    <td className="px-4 py-2 text-muted-foreground">{idx + 1}</td>
                    {row.map((cell, cellIdx) => (
                      <td key={cellIdx} className="px-4 py-2">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* Data Quality Card */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Data Quality Check</h3>
        <div className="grid grid-cols-4 gap-4 mb-4">
          <div className="p-4 border rounded-lg border-green-200 bg-green-50">
            <div className="text-2xl font-bold text-green-600">124,993</div>
            <div className="text-sm text-muted-foreground">Valid Rows</div>
          </div>
          <div className="p-4 border rounded-lg border-red-200 bg-red-50">
            <div className="text-2xl font-bold text-red-600">5</div>
            <div className="text-sm text-muted-foreground">Errors</div>
          </div>
          <div className="p-4 border rounded-lg border-yellow-200 bg-yellow-50">
            <div className="text-2xl font-bold text-yellow-600">2</div>
            <div className="text-sm text-muted-foreground">Warnings</div>
          </div>
          <div className="p-4 border rounded-lg">
            <div className="text-2xl font-bold">99.99%</div>
            <div className="text-sm text-muted-foreground">Success Rate</div>
          </div>
        </div>

        {/* Error Type Breakdown */}
        <div className="mb-4 p-4 border rounded-lg bg-muted/30">
          <h4 className="text-sm font-semibold mb-3">Error Breakdown by Type</h4>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(errorStats.byType).map(([type, count]) => (
              <div key={type} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{type.replace(/_/g, ' ')}</span>
                <span className="font-semibold">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Detailed Error List */}
        {mockErrors.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold">Detailed Error Log</h4>
              <Button variant="outline" size="sm">
                <Download className="h-3 w-3 mr-2" />
                Export All Errors
              </Button>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {mockErrors.map((err, idx) => (
                <div
                  key={idx}
                  className={`p-3 border rounded-lg ${
                    err.severity === 'error'
                      ? 'bg-red-50 border-red-200'
                      : 'bg-yellow-50 border-yellow-200'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <AlertCircle
                      className={`h-4 w-4 flex-shrink-0 mt-0.5 ${
                        err.severity === 'error' ? 'text-red-500' : 'text-yellow-500'
                      }`}
                    />
                    <div className="flex-1 text-sm space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">Row {err.row}</span>
                        <span className="text-xs px-2 py-0.5 bg-white rounded border">
                          Column: {err.column}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            err.severity === 'error'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-yellow-100 text-yellow-700'
                          }`}
                        >
                          {err.errorType}
                        </span>
                      </div>
                      <div className="text-muted-foreground">
                        <strong>Value:</strong> "{err.value}"
                      </div>
                      <div className="text-red-700 font-medium">{err.error}</div>
                      <div className="text-xs text-muted-foreground">
                        💡 <strong>Suggestion:</strong> {err.suggestion}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );

  const renderMappingStep = () => (
    <Card className="p-6">
      <h2 className="text-xl font-semibold mb-4">Map Columns</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Map source columns to target table columns, or create a new table.
      </p>

      <div className="space-y-4">
        {mockPreviewData.columns.map((col, idx) => (
          <div key={col} className="flex items-center gap-4 p-4 border rounded-lg">
            <div className="flex-1">
              <div className="font-medium text-sm">{col}</div>
              <div className="text-xs text-muted-foreground">Source Column</div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <select className="flex-1 px-3 py-2 border rounded-md text-sm">
              <option value={col}>{col}</option>
              <option value={`target_${col}`}>target_{col}</option>
              <option value="">Skip this column</option>
            </select>
            <div className="flex-1">
              <select className="w-full px-3 py-2 border rounded-md text-sm">
                <option>Text</option>
                <option>Number</option>
                <option>Date</option>
                <option>Boolean</option>
              </select>
            </div>
          </div>
        ))}
      </div>

      <Alert className="mt-6">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>Tip:</strong> Select "Skip this column" to exclude columns from import.
        </AlertDescription>
      </Alert>
    </Card>
  );

  const renderTargetStep = () => (
    <div className="space-y-4">
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Choose Import Target</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Where should the data be imported?
        </p>

        <div className="space-y-3">
          {/* Option 1: Stage in GovDataHub */}
          <div className="border-2 border-primary rounded-lg p-4 bg-primary/5">
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name="target"
                id="staging"
                defaultChecked
                className="mt-1"
              />
              <div className="flex-1">
                <label htmlFor="staging" className="font-semibold cursor-pointer">
                  Stage in GovDataHub (Recommended)
                </label>
                <p className="text-sm text-muted-foreground mt-1">
                  Import data into GovDataHub's metadata database. You can query it
                  immediately via cross-database queries, then optionally push to a target
                  database later.
                </p>
                <div className="mt-3 p-3 bg-white rounded border">
                  <div className="text-sm font-medium mb-2">Table Name</div>
                  <input
                    type="text"
                    placeholder="e.g., citizens_import_2024"
                    className="w-full px-3 py-2 border rounded-md"
                    defaultValue="citizens_data"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Option 2: Import to Database */}
          <div className="border-2 rounded-lg p-4 hover:border-primary hover:bg-accent/50 transition-colors">
            <div className="flex items-start gap-3">
              <input type="radio" name="target" id="database" className="mt-1" />
              <div className="flex-1">
                <label htmlFor="database" className="font-semibold cursor-pointer">
                  Import Directly to Connected Database
                </label>
                <p className="text-sm text-muted-foreground mt-1">
                  Import data directly into one of your connected databases. Requires write
                  permissions on the target database.
                </p>
                <div className="mt-3 space-y-3 opacity-50">
                  <div>
                    <div className="text-sm font-medium mb-2">Select Database</div>
                    <select className="w-full px-3 py-2 border rounded-md bg-white" disabled>
                      <option>Citizen Registry (PostgreSQL)</option>
                      <option>Vehicle Database (MySQL)</option>
                      <option>Licenses DB (PostgreSQL)</option>
                    </select>
                  </div>
                  <div>
                    <div className="text-sm font-medium mb-2">Target Table</div>
                    <select className="w-full px-3 py-2 border rounded-md bg-white" disabled>
                      <option>Create new table</option>
                      <option>Append to existing table</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-3">Import Options</h3>
        <div className="space-y-3">
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked />
            <span className="text-sm">Skip rows with errors (log errors for review)</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked />
            <span className="text-sm">Trim whitespace from text fields</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" />
            <span className="text-sm">Delete existing data before import</span>
          </label>
        </div>
      </Card>
    </div>
  );

  const renderProgressStep = () => (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold">Importing Data</h2>
            <p className="text-sm text-muted-foreground">
              Processing citizens_data.csv...
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-green-600">87%</div>
            <div className="text-xs text-muted-foreground">Complete</div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all duration-500"
              style={{ width: '87%' }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>108,750 / 125,000 rows processed</span>
            <span>~2 minutes remaining</span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="p-3 border rounded-lg text-center">
            <div className="text-lg font-bold text-green-600">108,747</div>
            <div className="text-xs text-muted-foreground">Succeeded</div>
          </div>
          <div className="p-3 border rounded-lg text-center">
            <div className="text-lg font-bold text-red-600">3</div>
            <div className="text-xs text-muted-foreground">Failed</div>
          </div>
          <div className="p-3 border rounded-lg text-center">
            <div className="text-lg font-bold">16,250</div>
            <div className="text-xs text-muted-foreground">Remaining</div>
          </div>
          <div className="p-3 border rounded-lg text-center">
            <div className="text-lg font-bold">~2 min</div>
            <div className="text-xs text-muted-foreground">ETA</div>
          </div>
        </div>

        {/* Live Log */}
        <div className="border rounded-lg p-4 bg-muted/30 max-h-48 overflow-y-auto">
          <div className="text-xs font-mono space-y-1">
            <div className="text-green-600">[12:45:23] ✓ Processed rows 108,000-108,500</div>
            <div className="text-green-600">[12:45:22] ✓ Processed rows 107,500-108,000</div>
            <div className="text-yellow-600">[12:45:21] ⚠ Row 107,234: Invalid email format, skipped</div>
            <div className="text-green-600">[12:45:20] ✓ Processed rows 107,000-107,500</div>
            <div className="text-green-600">[12:45:19] ✓ Processed rows 106,500-107,000</div>
          </div>
        </div>
      </Card>

      {/* Errors & Warnings Card */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">
              Import Issues ({errorStats.bySeverity.error + errorStats.bySeverity.warning})
            </h3>
            <p className="text-sm text-muted-foreground">
              {errorStats.bySeverity.error} errors, {errorStats.bySeverity.warning} warnings
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Download className="h-3 w-3 mr-2" />
              Export CSV
            </Button>
            <Button variant="outline" size="sm">
              <FileText className="h-3 w-3 mr-2" />
              Export PDF Report
            </Button>
          </div>
        </div>

        {/* Error Statistics */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="p-3 border rounded-lg bg-red-50">
            <div className="text-xl font-bold text-red-600">
              {errorStats.bySeverity.error}
            </div>
            <div className="text-xs text-muted-foreground">Critical Errors</div>
            <div className="text-xs text-red-600 mt-1">
              Rows skipped - fix required
            </div>
          </div>
          <div className="p-3 border rounded-lg bg-yellow-50">
            <div className="text-xl font-bold text-yellow-600">
              {errorStats.bySeverity.warning}
            </div>
            <div className="text-xs text-muted-foreground">Warnings</div>
            <div className="text-xs text-yellow-600 mt-1">
              Rows imported - review recommended
            </div>
          </div>
          <div className="p-3 border rounded-lg bg-blue-50">
            <div className="text-xl font-bold text-blue-600">
              {Object.keys(errorStats.byColumn).length}
            </div>
            <div className="text-xs text-muted-foreground">Affected Columns</div>
            <div className="text-xs text-blue-600 mt-1">
              {Object.keys(errorStats.byColumn).join(', ')}
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-4 border-b">
          <button className="px-4 py-2 text-sm font-medium border-b-2 border-primary">
            All ({mockErrors.length})
          </button>
          <button className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
            Errors ({errorStats.bySeverity.error})
          </button>
          <button className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
            Warnings ({errorStats.bySeverity.warning})
          </button>
          <button className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
            By Type
          </button>
        </div>

        {/* Detailed Error List */}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {mockErrors.map((err, idx) => (
            <div
              key={idx}
              className={`p-4 border rounded-lg ${
                err.severity === 'error'
                  ? 'bg-red-50 border-red-200'
                  : 'bg-yellow-50 border-yellow-200'
              }`}
            >
              <div className="flex items-start gap-3">
                <AlertCircle
                  className={`h-5 w-5 flex-shrink-0 mt-0.5 ${
                    err.severity === 'error' ? 'text-red-500' : 'text-yellow-500'
                  }`}
                />
                <div className="flex-1 space-y-2">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">Row {err.row.toLocaleString()}</span>
                      <span className="text-xs px-2 py-0.5 bg-white rounded border font-medium">
                        {err.column}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-medium ${
                          err.severity === 'error'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {err.errorType.replace(/_/g, ' ')}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-medium uppercase ${
                          err.severity === 'error'
                            ? 'bg-red-200 text-red-800'
                            : 'bg-yellow-200 text-yellow-800'
                        }`}
                      >
                        {err.severity}
                      </span>
                    </div>
                    <button className="text-xs text-primary hover:underline">
                      View Row Data
                    </button>
                  </div>

                  {/* Error Details */}
                  <div className="space-y-1.5 text-sm">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      <div>
                        <span className="text-muted-foreground">Invalid Value:</span>{' '}
                        <code className="px-1.5 py-0.5 bg-white rounded text-xs border">
                          {err.value}
                        </code>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Error:</span>{' '}
                        <span className="font-medium text-red-700">{err.error}</span>
                      </div>
                    </div>
                  </div>

                  {/* Suggestion */}
                  <div className="flex items-start gap-2 p-2 bg-white/80 rounded border">
                    <span className="text-sm">💡</span>
                    <div className="text-xs">
                      <strong className="text-primary">How to fix:</strong>{' '}
                      <span className="text-muted-foreground">{err.suggestion}</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-1">
                    <button className="text-xs px-3 py-1 bg-white hover:bg-gray-50 border rounded-md">
                      Copy Row Number
                    </button>
                    <button className="text-xs px-3 py-1 bg-white hover:bg-gray-50 border rounded-md">
                      Mark as Reviewed
                    </button>
                    <button className="text-xs px-3 py-1 bg-white hover:bg-gray-50 border rounded-md text-red-600">
                      Report Issue
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Summary Footer */}
        <div className="mt-4 p-3 bg-muted/50 rounded-lg border">
          <div className="text-sm">
            <strong>Action Required:</strong> Review and fix {errorStats.bySeverity.error} errors in
            your source file, then re-upload. Warnings can be reviewed later.
          </div>
        </div>
      </Card>
    </div>
  );

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Data Ingestion</h1>
        <p className="text-sm text-muted-foreground">
          Import data from CSV, Excel, JSON, or Parquet files into your databases
        </p>
      </div>

      {/* Step Indicator */}
      {renderStepIndicator()}

      {/* Step Content */}
      <div className="mb-6">
        {currentStep === 'upload' && renderUploadStep()}
        {currentStep === 'preview' && renderPreviewStep()}
        {currentStep === 'mapping' && renderMappingStep()}
        {currentStep === 'target' && renderTargetStep()}
        {currentStep === 'progress' && renderProgressStep()}
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => {
            const currentIndex = steps.findIndex(s => s.id === currentStep);
            if (currentIndex > 0) {
              setCurrentStep(steps[currentIndex - 1].id as Step);
            }
          }}
          disabled={currentStep === 'upload' || currentStep === 'progress'}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Previous
        </Button>

        {currentStep !== 'progress' ? (
          <Button
            onClick={() => {
              const currentIndex = steps.findIndex(s => s.id === currentStep);
              if (currentIndex < steps.length - 1) {
                setCurrentStep(steps[currentIndex + 1].id as Step);
              }
            }}
          >
            {currentStep === 'target' ? 'Start Import' : 'Next'}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        ) : (
          <Button variant="outline">
            <X className="h-4 w-4 mr-2" />
            Cancel Import
          </Button>
        )}
      </div>
    </div>
  );
}
