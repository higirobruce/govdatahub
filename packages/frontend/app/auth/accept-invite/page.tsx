'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ShieldCheck, AlertCircle, CheckCircle2 } from 'lucide-react';

const TOKEN_KEY = 'govdatahub_token';

export default function AcceptInvitePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [invite, setInvite] = useState<{ email: string; role: string } | null>(null);
  const [tokenError, setTokenError] = useState('');
  const [form, setForm] = useState({ firstName: '', lastName: '', password: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) { setTokenError('No invitation token provided.'); return; }
    api.users.validateInviteToken(token)
      .then(setInvite)
      .catch((e: any) => setTokenError(e.message || 'Invalid or expired invitation link.'));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) { setError('Passwords do not match'); return; }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setSaving(true);
    setError('');
    try {
      const authResponse = await api.users.acceptInvite({
        token,
        firstName: form.firstName,
        lastName: form.lastName,
        password: form.password,
      });
      // Store JWT and redirect directly into the app — no login step needed
      localStorage.setItem(TOKEN_KEY, authResponse.accessToken);
      setDone(true);
      setTimeout(() => router.replace('/'), 1200);
    } catch (e: any) {
      setError(e.message || 'Failed to accept invitation');
    } finally {
      setSaving(false);
    }
  };

  if (tokenError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <p className="font-semibold text-gray-800 mb-1">Invalid Invitation</p>
            <p className="text-sm text-gray-500">{tokenError}</p>
            <Button className="mt-6" variant="outline" onClick={() => router.push('/login')}>
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <p className="font-semibold text-gray-800">Welcome aboard!</p>
            <p className="text-sm text-gray-500 mt-1">Taking you in…</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-400">Validating invitation…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center mb-2">
            <ShieldCheck className="w-5 h-5 text-indigo-600" />
          </div>
          <CardTitle>Accept Invitation</CardTitle>
          <CardDescription>
            You've been invited as <strong className="capitalize">{invite.role.replace('_', ' ')}</strong>.
            Set up your account to get started.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Email</Label>
              <Input value={invite.email} disabled className="mt-1 bg-gray-50" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  required
                  value={form.firstName}
                  onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  required
                  value={form.lastName}
                  onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="password">Password *</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="At least 8 characters"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="confirm">Confirm Password *</Label>
              <Input
                id="confirm"
                type="password"
                required
                value={form.confirm}
                onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
                className="mt-1"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" /> {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? 'Creating account…' : 'Create Account & Sign In'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
