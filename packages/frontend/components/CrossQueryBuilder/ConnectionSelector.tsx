'use client';

import { useEffect, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
    <div className="space-y-3">
      {connections.map((connection) => (
        <div key={connection.id} className="flex items-start space-x-3 p-3 rounded-md hover:bg-accent">
          <Checkbox
            id={connection.id}
            checked={selectedConnections.includes(connection.id)}
            onCheckedChange={() => toggleConnection(connection.id)}
          />
          <div className="flex-1 space-y-1">
            <Label
              htmlFor={connection.id}
              className="text-sm font-medium leading-none cursor-pointer flex items-center gap-2"
            >
              <Database className="h-4 w-4" />
              {connection.name}
            </Label>
            <p className="text-xs text-muted-foreground">
              {connection.type} • {connection.host}/{connection.database}
            </p>
          </div>
        </div>
      ))}

      {selectedConnections.length > 0 && (
        <p className="text-xs text-muted-foreground mt-4">
          {selectedConnections.length} connection(s) selected
        </p>
      )}
    </div>
  );
}
