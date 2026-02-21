'use client';

import { useState } from 'react';
import { CreateConnectionDto } from '@/types';
import { Button } from '@/components/ui/button';

interface ConnectionFormProps {
  onSubmit: (data: CreateConnectionDto) => Promise<void>;
}

export default function ConnectionForm({ onSubmit }: ConnectionFormProps) {
  const [formData, setFormData] = useState<CreateConnectionDto>({
    name: '',
    type: 'postgresql',
    host: 'localhost',
    port: 5432,
    username: '',
    password: '',
    database: '',
    ssl: false,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTypeChange = (type: 'postgresql' | 'mysql') => {
    setFormData({
      ...formData,
      type,
      port: type === 'postgresql' ? 5432 : 3306,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await onSubmit(formData);
      // Reset form on success
      setFormData({
        name: '',
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        username: '',
        password: '',
        database: '',
        ssl: false,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to create connection');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-[#fee2e2] border border-[#fca5a5] text-[#991b1b] px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-[#555555]">
            Connection Name *
          </label>
          <input
            type="text"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="mt-1 block w-full rounded-md border border-[#dddddd] px-3 py-2 text-[13px] focus:border-[#1a1a1a] focus:ring-1 focus:ring-[#1a1a1a] outline-none"
            placeholder="My Database"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#555555]">
            Database Type *
          </label>
          <select
            required
            value={formData.type}
            onChange={(e) =>
              handleTypeChange(e.target.value as 'postgresql' | 'mysql')
            }
            className="mt-1 block w-full rounded-md border border-[#dddddd] px-3 py-2 text-[13px] focus:border-[#1a1a1a] focus:ring-1 focus:ring-[#1a1a1a] outline-none"
          >
            <option value="postgresql">PostgreSQL</option>
            <option value="mysql">MySQL</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-[#555555]">
            Host *
          </label>
          <input
            type="text"
            required
            value={formData.host}
            onChange={(e) => setFormData({ ...formData, host: e.target.value })}
            className="mt-1 block w-full rounded-md border border-[#dddddd] px-3 py-2 text-[13px] focus:border-[#1a1a1a] focus:ring-1 focus:ring-[#1a1a1a] outline-none"
            placeholder="localhost"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#555555]">
            Port *
          </label>
          <input
            type="number"
            required
            min="1"
            max="65535"
            value={formData.port}
            onChange={(e) =>
              setFormData({ ...formData, port: parseInt(e.target.value, 10) })
            }
            className="mt-1 block w-full rounded-md border border-[#dddddd] px-3 py-2 text-[13px] focus:border-[#1a1a1a] focus:ring-1 focus:ring-[#1a1a1a] outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#555555]">
            Username *
          </label>
          <input
            type="text"
            required
            value={formData.username}
            onChange={(e) =>
              setFormData({ ...formData, username: e.target.value })
            }
            className="mt-1 block w-full rounded-md border border-[#dddddd] px-3 py-2 text-[13px] focus:border-[#1a1a1a] focus:ring-1 focus:ring-[#1a1a1a] outline-none"
            placeholder="admin"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#555555]">
            Password *
          </label>
          <input
            type="password"
            required
            value={formData.password}
            onChange={(e) =>
              setFormData({ ...formData, password: e.target.value })
            }
            className="mt-1 block w-full rounded-md border border-[#dddddd] px-3 py-2 text-[13px] focus:border-[#1a1a1a] focus:ring-1 focus:ring-[#1a1a1a] outline-none"
            placeholder="••••••••"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#555555]">
            Database Name *
          </label>
          <input
            type="text"
            required
            value={formData.database}
            onChange={(e) =>
              setFormData({ ...formData, database: e.target.value })
            }
            className="mt-1 block w-full rounded-md border border-[#dddddd] px-3 py-2 text-[13px] focus:border-[#1a1a1a] focus:ring-1 focus:ring-[#1a1a1a] outline-none"
            placeholder="mydb"
          />
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="ssl"
            checked={formData.ssl}
            onChange={(e) =>
              setFormData({ ...formData, ssl: e.target.checked })
            }
            className="h-4 w-4 text-[#1a1a1a] focus:ring-[#1a1a1a] border-[#dddddd] rounded"
          />
          <label htmlFor="ssl" className="ml-2 block text-sm text-[#555555]">
            Enable SSL
          </label>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={loading}>
          {loading ? 'Creating...' : 'Create Connection'}
        </Button>
      </div>
    </form>
  );
}
