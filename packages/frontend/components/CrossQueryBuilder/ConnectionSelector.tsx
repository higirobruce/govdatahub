'use client';

import { useEffect, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Loader2, Database, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';

interface Connection {
  id: string;
  name: string;
  type: string;
  host: string;
  database: string;
}

interface ConnectionSelectorProps {
  selectedConnections: string[];
  onSelectionChange: (connectionIds: string[]) => void;
}

export function ConnectionSelector({
  selectedConnections,
  onSelectionChange,
}: ConnectionSelectorProps) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    try {
      const data = await api.connections.list();
      setConnections(data as Connection[]);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load connections');
    } finally {
      setLoading(false);
    }
  };

  const toggleConnection = (connectionId: string) => {
    if (selectedConnections.includes(connectionId)) {
      onSelectionChange(selectedConnections.filter((id) => id !== connectionId));
    } else {
      onSelectionChange([...selectedConnections, connectionId]);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (connections.length === 0) {
    return (
      <Alert>
        <AlertDescription>
          No connections found. Please add a connection first.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-1">
        {connections.map((connection) => (
          <Tooltip key={connection.id}>
            <TooltipTrigger asChild>
              <div className="flex items-center space-x-2 p-2 rounded hover:bg-accent">
                <Checkbox
                  id={connection.id}
                  checked={selectedConnections.includes(connection.id)}
                  onCheckedChange={() => toggleConnection(connection.id)}
                />
                <Label
                  htmlFor={connection.id}
                  className="text-xs font-medium cursor-pointer flex items-center gap-1.5 flex-1 truncate"
                >
                  <Database className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{connection.name}</span>
                </Label>
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs">
              <div className="space-y-1">
                <div className="font-semibold">{connection.name}</div>
                <div className="text-xs text-muted-foreground">
                  Type: {connection.type}
                </div>
                <div className="text-xs text-muted-foreground">
                  Host: {connection.host}
                </div>
                <div className="text-xs text-muted-foreground">
                  Database: {connection.database}
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        ))}

        {selectedConnections.length > 0 && (
          <p className="text-xs text-muted-foreground pt-2 border-t mt-2">
            {selectedConnections.length} selected
          </p>
        )}
      </div>
    </TooltipProvider>
  );
}
