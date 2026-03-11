'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { Building2, Plus, Users, ToggleLeft, ToggleRight, ChevronRight } from 'lucide-react';

export default function AdminOrganizationsPage() {
  const { showToast } = useToast();
  const { data: orgs, isLoading } = useSWR('admin/organizations', () => api.admin.listOrganizations());

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', subdomain: '' });
  const [saving, setSaving] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<any>(null);
  const [orgUsers, setOrgUsers] = useState<any[]>([]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.admin.createOrganization(form);
      mutate('admin/organizations');
      setCreating(false);
      setForm({ name: '', subdomain: '' });
      showToast('Organization created', 'success');
    } catch (e: any) {
      showToast(e.message || 'Failed to create', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (id: string, current: boolean) => {
    try {
      await api.admin.updateOrganization(id, { isActive: !current });
      mutate('admin/organizations');
      if (selectedOrg?.id === id) setSelectedOrg((o: any) => ({ ...o, isActive: !current }));
      showToast(`Organization ${current ? 'suspended' : 'activated'}`, 'success');
    } catch (e: any) {
      showToast(e.message || 'Update failed', 'error');
    }
  };

  const handleSelectOrg = async (org: any) => {
    setSelectedOrg(org);
    const users = await api.admin.listUsersInOrg(org.id);
    setOrgUsers(users);
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Organizations</h1>
          <p className="text-sm text-gray-500 mt-0.5">{orgs?.length ?? 0} organizations registered</p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="w-4 h-4 mr-2" /> New Organization
        </Button>
      </div>

      {creating && (
        <Card className="p-5 mb-6 border-indigo-200 bg-indigo-50">
          <h2 className="font-semibold text-sm mb-4">Create Organization</h2>
          <form onSubmit={handleCreate} className="flex gap-3 items-end flex-wrap">
            <div className="flex-1 min-w-48">
              <Label htmlFor="orgName">Organization Name</Label>
              <Input
                id="orgName"
                required
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ministry of Finance"
                className="mt-1"
              />
            </div>
            <div className="w-48">
              <Label htmlFor="orgSubdomain">Subdomain</Label>
              <Input
                id="orgSubdomain"
                required
                value={form.subdomain}
                onChange={e => setForm(f => ({ ...f, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
                placeholder="mof"
                className="mt-1"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={saving}>{saving ? 'Creating…' : 'Create'}</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      <div className="flex gap-6">
        {/* Org list */}
        <div className="w-80 space-y-2">
          {isLoading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : orgs?.map((org: any) => (
            <button
              key={org.id}
              onClick={() => handleSelectOrg(org)}
              className={`w-full text-left p-4 rounded-lg border bg-white hover:shadow-sm transition-all flex items-center justify-between ${selectedOrg?.id === org.id ? 'border-indigo-400 ring-1 ring-indigo-200' : ''}`}
            >
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <Building2 className="w-4 h-4 text-gray-400" />
                  <span className="font-medium text-sm">{org.name}</span>
                  {!org.isActive && (
                    <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded">Suspended</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 ml-6">{org.subdomain} · {org.userCount} users</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300" />
            </button>
          ))}
        </div>

        {/* Org detail */}
        {selectedOrg && (
          <div className="flex-1">
            <Card className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="font-semibold">{selectedOrg.name}</h2>
                  <p className="text-sm text-gray-500">subdomain: {selectedOrg.subdomain}</p>
                </div>
                <button
                  onClick={() => handleToggleActive(selectedOrg.id, selectedOrg.isActive)}
                  className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
                >
                  {selectedOrg.isActive
                    ? <><ToggleRight className="w-5 h-5 text-green-500" /> Active</>
                    : <><ToggleLeft className="w-5 h-5 text-gray-400" /> Suspended</>
                  }
                </button>
              </div>

              <h3 className="font-medium text-sm mb-3 flex items-center gap-2 text-gray-600">
                <Users className="w-4 h-4" />
                Users ({orgUsers.length})
              </h3>
              <div className="space-y-2">
                {orgUsers.map((u: any) => (
                  <div key={u.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <span className="text-sm font-medium">{u.firstName} {u.lastName}</span>
                      <span className="text-xs text-gray-500 ml-2">{u.email}</span>
                    </div>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded capitalize">
                      {u.role.replace('_', ' ')}
                    </span>
                  </div>
                ))}
                {orgUsers.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">No users yet</p>
                )}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
