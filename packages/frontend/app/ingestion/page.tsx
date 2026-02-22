'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Check, ChevronRight, Upload } from 'lucide-react';
import { FileUpload, UploadedFile } from '@/components/DataIngestion/FileUpload';
import { DataPreview, PreviewData } from '@/components/DataIngestion/DataPreview';
import {
  ColumnMapping,
  ColumnMappingData,
} from '@/components/DataIngestion/ColumnMapping';
import { ImportProgress } from '@/components/DataIngestion/ImportProgress';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';

type Step = 'upload' | 'preview' | 'target' | 'mapping' | 'progress';
type ImportTab = 'file' | 'database' | 'url';

interface StepConfig {
  id: Step;
  label: string;
  description: string;
}

const steps: StepConfig[] = [
  {
    id: 'upload',
    label: 'Upload File',
    description: 'Select your data file',
  },
  {
    id: 'preview',
    label: 'Preview Data',
    description: 'Review data quality',
  },
  {
    id: 'target',
    label: 'Select Target',
    description: 'Choose destination',
  },
  {
    id: 'mapping',
    label: 'Map Columns',
    description: 'Map source to target',
  },
  {
    id: 'progress',
    label: 'Import',
    description: 'Track progress',
  },
];

export default function DataIngestionPage() {
  const { showToast } = useToast();
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<Step>('upload');
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [targetType, setTargetType] = useState<'staging' | 'database'>('staging');
  const [targetTable, setTargetTable] = useState('');
  const [connectionId, setConnectionId] = useState('');
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [importJobId, setImportJobId] = useState<string | null>(null);

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);

  const handleTabChange = (tab: ImportTab) => {
    if (tab === 'database') {
      router.push('/ingestion/database');
    } else if (tab === 'url') {
      router.push('/ingestion/url');
    }
    // 'file' tab is current page, no navigation needed
  };

  const tabs = [
    {
      id: 'file' as ImportTab,
      label: 'Import from File',
      description: 'Upload CSV, Excel, or JSON files',
    },
    {
      id: 'database' as ImportTab,
      label: 'Import from Database',
      description: 'Import data from connected databases',
    },
    {
      id: 'url' as ImportTab,
      label: 'Import from URL',
      description: 'Download and import from URL',
    },
  ];

  const handleFileSelect = async (file: UploadedFile) => {
    setUploadedFile(file);
  };

  const handleGeneratePreview = async () => {
    if (!uploadedFile) return;

    setPreviewLoading(true);

    try {
      const data = await api.ingestion.preview(uploadedFile.file, {
        delimiter: ',',
        hasHeader: true,
      });

      setPreviewData(data);
      setCurrentStep('preview');
    } catch (error) {
      console.error('Preview error:', error);
      showToast('Failed to generate preview. Please try again.', 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleStartImport = async () => {
    if (!uploadedFile) return;

    try {
      const uploadDto = {
        targetType,
        targetTable: targetType === 'database' ? targetTable : (targetTable || uploadedFile.file.name),
        connectionId: targetType === 'database' ? connectionId : undefined,
        config: { delimiter: ',', hasHeader: true },
      };

      const job = await api.ingestion.upload(uploadedFile.file, uploadDto);
      setImportJobId(job.id);
      setCurrentStep('progress');
    } catch (error) {
      console.error('Import error:', error);
      showToast('Failed to start import. Please try again.', 'error');
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 'upload':
        return uploadedFile !== null;
      case 'preview':
        return previewData !== null;
      case 'target':
        if (targetType === 'database') {
          return connectionId && targetTable;
        }
        return true; // Staging doesn't require connection
      case 'mapping':
        return true; // Mapping is optional
      default:
        return false;
    }
  };

  const handleNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      const nextStep = steps[nextIndex].id;

      // Special handling
      if (currentStep === 'upload') {
        handleGeneratePreview();
        return;
      }

      if (currentStep === 'mapping') {
        handleStartImport();
        return;
      }

      setCurrentStep(nextStep);
    }
  };

  const handleBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(steps[prevIndex].id);
    }
  };

  const handleReset = () => {
    setCurrentStep('upload');
    setUploadedFile(null);
    setPreviewData(null);
    setTargetType('staging');
    setTargetTable('');
    setConnectionId('');
    setColumnMapping({});
    setImportJobId(null);
  };

  return (
    <div className="w-full">
      <PageHeader
        title="Data Ingestion"
        subtitle="Import data from multiple sources into your data hub"
        icon={Upload}
      />

      {/* Tab Navigation */}
      <div className="bg-white rounded-xl border border-[#e8e8e8] shadow-card mb-6">
        <div className="border-b border-[#f0f0f0]">
          <nav className="-mb-px flex" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`
                  flex-1 py-4 px-1 text-center border-b-2 font-medium text-sm transition-colors
                  ${
                    tab.id === 'file'
                      ? 'border-[#1a1a1a] text-[#1a1a1a]'
                      : 'border-transparent text-[#555555] hover:text-[#1a1a1a] hover:border-[#e8e8e8]'
                  }
                `}
              >
                <div>
                  <div className="font-semibold">{tab.label}</div>
                  <div className="text-xs mt-1 opacity-75">{tab.description}</div>
                </div>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Stepper */}
      <Card className="mb-8">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center flex-1">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full border-2 font-semibold transition-colors ${
                      index < currentStepIndex
                        ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]'
                        : index === currentStepIndex
                        ? 'border-[#1a1a1a] text-[#1a1a1a]'
                        : 'border-[#dddddd] text-[#aaaaaa]'
                    }`}
                  >
                    {index < currentStepIndex ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      index + 1
                    )}
                  </div>
                  <div>
                    <p
                      className={`font-semibold text-sm ${
                        index <= currentStepIndex
                          ? 'text-[#1a1a1a]'
                          : 'text-[#aaaaaa]'
                      }`}
                    >
                      {step.label}
                    </p>
                    <p className="text-xs text-[#aaaaaa]">
                      {step.description}
                    </p>
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <ChevronRight className="h-5 w-5 mx-4 text-[#aaaaaa] flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Step Content */}
      <div className="min-h-[500px]">
        {currentStep === 'upload' && (
          <FileUpload
            onFileSelect={handleFileSelect}
            acceptedFormats={['.csv', '.xlsx', '.xls', '.json']}
            maxSizeMB={100}
          />
        )}

        {currentStep === 'preview' && previewData && (
          <DataPreview data={previewData} loading={previewLoading} />
        )}

        {currentStep === 'target' && (
          <Card>
            <CardHeader>
              <CardTitle>Select Import Target</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="targetType">Target Type</Label>
                  <Select
                    value={targetType}
                    onValueChange={(value: 'staging' | 'database') =>
                      setTargetType(value)
                    }
                  >
                    <SelectTrigger id="targetType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="staging">
                        Staging (Metadata DB)
                      </SelectItem>
                      <SelectItem value="database">
                        Direct to Database
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground mt-2">
                    {targetType === 'staging'
                      ? 'Data will be stored in the metadata database for review and transformation'
                      : 'Data will be imported directly to the selected target database'}
                  </p>
                </div>

                {targetType === 'database' && (
                  <>
                    <div>
                      <Label htmlFor="connection">Connection</Label>
                      <Select value={connectionId} onValueChange={setConnectionId}>
                        <SelectTrigger id="connection">
                          <SelectValue placeholder="Select connection" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="conn-1">
                            PostgreSQL - Production
                          </SelectItem>
                          <SelectItem value="conn-2">
                            PostgreSQL - Staging
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="targetTable">Target Table</Label>
                      <Input
                        id="targetTable"
                        placeholder="Enter table name"
                        value={targetTable}
                        onChange={(e) => setTargetTable(e.target.value)}
                      />
                      <p className="text-sm text-muted-foreground mt-2">
                        Table will be created if it doesn't exist
                      </p>
                    </div>
                  </>
                )}

                {targetType === 'staging' && (
                  <div>
                    <Label htmlFor="stagingTable">Table Name (Optional)</Label>
                    <Input
                      id="stagingTable"
                      placeholder="Auto-generated from filename"
                      value={targetTable}
                      onChange={(e) => setTargetTable(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {currentStep === 'mapping' && previewData && (
          <ColumnMapping
            data={{
              sourceColumns: previewData.schema,
              // targetColumns would be fetched from selected connection/table
            }}
            onMappingChange={setColumnMapping}
          />
        )}

        {currentStep === 'progress' && importJobId && (
          <ImportProgress
            jobId={importJobId}
            onComplete={() => {
              // Handle completion
            }}
            onError={(error) => {
              console.error('Import error:', error);
            }}
          />
        )}
      </div>

      {/* Navigation Buttons */}
      {currentStep !== 'progress' && (
        <div className="flex items-center justify-between mt-8">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStepIndex === 0}
          >
            Back
          </Button>

          <Button onClick={handleNext} disabled={!canProceed()}>
            {currentStep === 'upload' && 'Generate Preview'}
            {currentStep === 'preview' && 'Continue'}
            {currentStep === 'target' && 'Continue'}
            {currentStep === 'mapping' && 'Start Import'}
          </Button>
        </div>
      )}

      {currentStep === 'progress' && (
        <div className="flex justify-center mt-8">
          <Button onClick={handleReset}>Start New Import</Button>
        </div>
      )}
    </div>
  );
}
