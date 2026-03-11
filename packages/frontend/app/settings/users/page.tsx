'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';
import {
  Users, UserPlus, Mail, Trash2,
  ToggleLeft, ToggleRight, Clock, CheckCircle2,
} from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  org_admin:    'Org Admin',
  data_steward: 'Data Steward',
  editor:       'Editor',
  viewer:       'Viewer',
};

const ROLE_COLORS: Record<string, string> = {
  org_admin:    'bg-purple-100 text-purple-700',
  data_steward: 'bg-blue-100 text-blue-700',
  editor:       'bg-green-100 text-green-700',
  viewer:       'bg-gray-100 text-gray-600',
};

const ASSIGNABLE_ROLES = [
  { value: 'org_admin',    label: 'Org Admin' },
  { value: 'data_steward', label: 'Data Steward' },
  { value: 'editor',       label: 'Editor' },
  { value: 'viewer',       label: 'Viewer' },
];

export default function UsersPage() {
  const { user: me } = useAuth();
  const { showToast } = useToast();
  const isSuperAdmin = me?.role === 'super_admin';

  const { data: users } = useSWR('users', () => api.users.list());
  const { data: invites } = useSWR('users/invites', () => api.users.listInvites());
  // Super admin needs org list for the org selector
  const { data: orgs } = useSWR(
    isSuperAdmin ? 'admin/organizations' : null,
    () => api.admin.listOrganizations(),
  );

  const [inviteForm, setInviteForm] = useState({ email: '', role: 'editor', organizationId: '' });
  const [sending, setSending] = useState(false);
  const [inviteLink, setInviteLink] = useState('');

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSuperAdmin && !inviteForm.organizationId) {
      showToast('Please select an organization', 'error');
      return;
    }
    setSending(true);
    try {
      const body: any = { email: inviteForm.email, role: inviteForm.role };
      if (isSuperAdmin && inviteForm.organizationId) body.organizationId = inviteForm.organizationId;

      const result = await api.users.invite(body);
      const link = `${window.location.origin}/auth/accept-invite?token=${result.token}`;
      setInviteLink(link);
      mutate('users/invites');
      setInviteForm({ email: '', role: 'editor', organizationId: inviteForm.organizationId });
      showToast('Invitation created', 'success');
    } catch (e: any) {
      showToast(e.message || 'Failed to send invite', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleToggleActive = async (id: string, current: boolean) => {
    try {
      await api.users.update(id, { isActive: !current });
      mutate('users');
      showToast(`User ${current ? 'deactivated' : 'activated'}`, 'success');
    } catch (e: any) {
      showToast(e.message || 'Update failed', 'error');
    }
  };

  const handleChangeRole = async (id: string, role: string) => {
    try {
      await api.users.update(id, { role });
      mutate('users');
      showToast('Role updated', 'success');
    } catch (e: any) {
      showToast(e.message || 'Update failed', 'error');
    }
  };

  const handleRemove = async (id: string, name: string) => {
    if (!confirm(`Remove ${name} from the organization?`)) return;
    try {
      await api.users.remove(id);
      mutate('users');
      showToast('User removed', 'success');
    } catch (e: any) {
      showToast(e.message || 'Remove failed', 'error');
    }
  };

  const handleRevokeInvite = async (id: string) => {
    try {
      await api.users.revokeInvite(id);
      mutate('users/invites');
      showToast('Invite revoked', 'success');
    } catch (e: any) {
      showToast(e.message || 'Revoke failed', 'error');
    }
  };

  const pendingInvites = invites?.filter((i: any) => !i.acceptedAt) ?? [];

  return (
    <div className="h-screen flex flex-col">
      <PageHeader
        icon={Users}
        title="Users & Access"
        subtitle="Manage team members and invitations"
      />

      <div className="flex-1 overflow-auto p-6 space-y-8 max-w-5xl mx-auto w-full">

        {/* Invite form */}
        <Card className="p-6">
          <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-indigo-500" />
            Invite New Member
          </h2>
          <form onSubmit={handleInvite} className="flex gap-3 items-end flex-wrap">

            {/* Org selector — super_admin only */}
            {isSuperAdmin && (
              <div className="w-52">
                <Label htmlFor="inviteOrg">Organization *</Label>
                <select
                  id="inviteOrg"
                  required
                  value={inviteForm.organizationId}
                  onChange={e => setInviteForm(f => ({ ...f, organizationId: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">— Select org —</option>
                  {orgs?.map((o: any) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex-1 min-w-48">
              <Label htmlFor="inviteEmail">Email address</Label>
              <Input
                id="inviteEmail"
                type="email"
                required
                value={inviteForm.email}
                onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
                placeholder="colleague@agency.gov"
                className="mt-1"
              />
            </div>

            <div className="w-44">
              <Label htmlFor="inviteRole">Role</Label>
              <select
                id="inviteRole"
                value={inviteForm.role}
                onChange={e => setInviteForm(f => ({ ...f, role: e.target.value }))}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {ASSIGNABLE_ROLES.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            <Button type="submit" size="sm" disabled={sending}>
              {sending ? 'Sending…' : 'Send Invite'}
            </Button>
          </form>

          {inviteLink && (
            <div className="mt-4 p-3 bg-indigo-50 rounded-lg border border-indigo-200">
              <p className="text-xs text-indigo-700 font-medium mb-1">Share this invite link:</p>
              <div className="flex gap-2 items-center">
                <code className="text-xs text-indigo-900 flex-1 truncate">{inviteLink}</code>
                <Button size="sm" variant="outline" onClick={() => {
                  navigator.clipboard.writeText(inviteLink);
                  showToast('Copied!', 'success');
                }}>
                  Copy
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Pending invites */}
        {pendingInvites.length > 0 && (
          <div>
            <h2 className="font-semibold text-sm mb-3 flex items-center gap-2 text-gray-700">
              <Clock className="w-4 h-4 text-amber-500" />
              Pending Invitations ({pendingInvites.length})
            </h2>
            <div className="space-y-2">
              {pendingInvites.map((inv: any) => (
                <div key={inv.id} className="flex items-center justify-between p-3 rounded-lg border bg-amber-50">
                  <div className="flex items-center gap-3">
                    <Mail className="w-4 h-4 text-amber-500" />
                    <div>
                      <p className="text-sm font-medium">{inv.email}</p>
                      <p className="text-xs text-gray-500">
                        {ROLE_LABELS[inv.role] ?? inv.role} · expires {new Date(inv.expiresAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleRevokeInvite(inv.id)}
                    className="text-red-400 hover:text-red-600">
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active users */}
        <div>
          <h2 className="font-semibold text-sm mb-3 flex items-center gap-2 text-gray-700">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            Team Members ({users?.length ?? 0})
          </h2>
          <div className="space-y-2">
            {users?.map((u: any) => (
              <div key={u.id} className={`flex items-center justify-between p-3 rounded-lg border ${!u.isActive ? 'opacity-50 bg-gray-50' : 'bg-white'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700">
                    {u.firstName[0]}{u.lastName[0]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{u.firstName} {u.lastName}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${ROLE_COLORS[u.role] ?? 'bg-gray-100 text-gray-600'}`}>
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                      {u.id === me?.id && <span className="text-xs text-gray-400">(you)</span>}
                    </div>
                    <p className="text-xs text-gray-500">{u.email}</p>
                  </div>
                </div>

                {u.id !== me?.id && (
                  <div className="flex items-center gap-2">
                    <select
                      value={u.role}
                      onChange={e => handleChangeRole(u.id, e.target.value)}
                      className="text-xs rounded border border-input bg-background px-2 py-1"
                    >
                      {ASSIGNABLE_ROLES.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                    <button
                      title={u.isActive ? 'Deactivate' : 'Activate'}
                      onClick={() => handleToggleActive(u.id, u.isActive)}
                    >
                      {u.isActive
                        ? <ToggleRight className="w-5 h-5 text-green-500" />
                        : <ToggleLeft className="w-5 h-5 text-gray-400" />
                      }
                    </button>
                    <Button variant="ghost" size="sm"
                      onClick={() => handleRemove(u.id, `${u.firstName} ${u.lastName}`)}
                      className="text-red-400 hover:text-red-600">
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
