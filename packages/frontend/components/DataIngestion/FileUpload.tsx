'use client';

import { useState, useCallback } from 'react';
import { Upload, FileText, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export interface UploadedFile {
  file: File;
  preview?: string;
}

interface FileUploadProps {
  onFileSelect: (file: UploadedFile) => void;
  acceptedFormats?: string[];
  maxSizeMB?: number;
}

export function FileUpload({
  onFileSelect,
  acceptedFormats = ['.csv', '.xlsx', '.xls', '.json'],
  maxSizeMB = 100,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<UploadedFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validateFile = (file: File): string | null => {
    // Check file extension
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!acceptedFormats.includes(extension)) {
      return `Invalid file type. Accepted formats: ${acceptedFormats.join(', ')}`;
    }

    // Check file size
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > maxSizeMB) {
      return `File too large. Maximum size: ${maxSizeMB}MB`;
    }

    return null;
  };

  const handleFile = useCallback(
    (file: File) => {
      setError(null);

      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }

      const uploadedFile: UploadedFile = { file };
      setSelectedFile(uploadedFile);
      onFileSelect(uploadedFile);
    },
    [onFileSelect]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        handleFile(files[0]);
      }
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFile(files[0]);
      }
    },
    [handleFile]
  );

  const handleRemove = () => {
    setSelectedFile(null);
    setError(null);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  return (
    <Card>
      <CardContent className="p-6">
        {!selectedFile ? (
          <div
            className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
              isDragging
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <Upload
              className={`mx-auto h-12 w-12 mb-4 ${
                isDragging ? 'text-primary' : 'text-muted-foreground'
              }`}
            />
            <h3 className="text-lg font-semibold mb-2">
              {isDragging ? 'Drop file here' : 'Upload Data File'}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Drag and drop your file here, or click to browse
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              Supported formats: {acceptedFormats.join(', ')} • Max size: {maxSizeMB}MB
            </p>

            <input
              type="file"
              id="file-upload"
              className="hidden"
              accept={acceptedFormats.join(',')}
              onChange={handleFileInput}
            />
            <Button asChild>
              <label htmlFor="file-upload" className="cursor-pointer">
                Select File
              </label>
            </Button>

            {error && (
              <div className="mt-4 p-3 bg-destructive/10 border border-destructive rounded-md">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-start gap-4 p-4 bg-muted rounded-lg">
            <FileText className="h-10 w-10 text-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold truncate">{selectedFile.file.name}</h4>
                  <p className="text-sm text-muted-foreground">
                    {formatFileSize(selectedFile.file.size)} •{' '}
                    {selectedFile.file.type || 'Unknown type'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRemove}
                  className="flex-shrink-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="mt-3 flex gap-2">
                <div className="h-2 flex-1 bg-background rounded-full overflow-hidden">
                  <div className="h-full w-full bg-primary" />
                </div>
                <span className="text-xs text-muted-foreground">Ready</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
