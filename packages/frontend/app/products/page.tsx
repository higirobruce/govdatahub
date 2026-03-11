'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';
import { LifecycleBadge, NEXT_STATES, TRANSITION_LABELS, ProductStatus } from '@/components/products/LifecycleBadge';
import { ProductForm } from '@/components/products/ProductForm';
import { PortForm } from '@/components/products/PortForm';
import { useAuth } from '@/lib/auth-context';
import { UserRole } from '@/types/auth';
import {
  Package, Plus, ChevronRight, Database, Layers,
  Trash2, ArrowRight, GitBranch, Edit3,
} from 'lucide-react';

const PORT_TYPE_COLORS: Record<string, string> = {
  outputport:        'bg-green-100 text-green-700',
  inputport:         'bg-blue-100 text-blue-700',
  controlport:       'bg-purple-100 text-purple-700',
  observabilityport: 'bg-orange-100 text-orange-700',
};

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'validated', label: 'Validated' },
  { value: 'active', label: 'Active' },
  { value: 'deprecated', label: 'Deprecated' },
  { value: 'decommissioned', label: 'Decommissioned' },
];

// Transitions that require data_steward or above
const GOVERNANCE_TRANSITIONS: ProductStatus[] = ['active', 'deprecated', 'decommissioned'];
const GOVERNANCE_ROLES: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.DATA_STEWARD];

export default function ProductsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const canGovernance = GOVERNANCE_ROLES.includes(user?.role as UserRole);
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [view, setView] = useState<'detail' | 'create' | 'edit' | 'add-port' | 'edit-port'>('detail');
  const [editingPort, setEditingPort] = useState<any>(null);
  const [transitioning, setTransitioning] = useState(false);

  const { data: products, isLoading } = useSWR(
    ['data-products', statusFilter],
    () => api.dataProducts.list(statusFilter ? { status: statusFilter } : undefined),
  );

  const { data: stats } = useSWR('data-products/stats', () => api.dataProducts.stats());

  // Refresh selected product after mutations
  const refreshSelected = async (id: string) => {
    const updated = await api.dataProducts.get(id);
    setSelected(updated);
    mutate(['data-products', statusFilter]);
    mutate('data-products/stats');
  };

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleCreate = async (data: any) => {
    await api.dataProducts.create(data);
    mutate(['data-products', statusFilter]);
    mutate('data-products/stats');
    setView('detail');
    showToast('Data product created', 'success');
  };

  const handleEdit = async (data: any) => {
    await api.dataProducts.update(selected.id, data);
    await refreshSelected(selected.id);
    setView('detail');
    showToast('Product updated', 'success');
  };

  const handleDelete = async (product: any) => {
    if (!confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    await api.dataProducts.delete(product.id);
    setSelected(null);
    mutate(['data-products', statusFilter]);
    mutate('data-products/stats');
    showToast('Product deleted', 'success');
  };

  const handleTransition = async (toStatus: ProductStatus) => {
    setTransitioning(true);
    try {
      await api.dataProducts.transition(selected.id, toStatus);
      await refreshSelected(selected.id);
      showToast(`Product is now ${toStatus}`, 'success');
    } catch (e: any) {
      showToast(e.message || 'Transition failed', 'error');
    } finally {
      setTransitioning(false);
    }
  };

  const handleAddPort = async (data: any) => {
    await api.dataProducts.addPort(selected.id, data);
    await refreshSelected(selected.id);
    setView('detail');
    showToast('Port added', 'success');
  };

  const handleEditPort = async (data: any) => {
    await api.dataProducts.updatePort(selected.id, editingPort.id, data);
    await refreshSelected(selected.id);
    setView('detail');
    setEditingPort(null);
    showToast('Port updated', 'success');
  };

  const handleDeletePort = async (portId: string) => {
    if (!confirm('Remove this port?')) return;
    await api.dataProducts.deletePort(selected.id, portId);
    await refreshSelected(selected.id);
    showToast('Port removed', 'success');
  };

  // ── Right panel ────────────────────────────────────────────────────────────

  const renderRightPanel = () => {
    if (view === 'create') {
      return (
        <div className="p-6">
          <h2 className="text-lg font-semibold mb-4">New Data Product</h2>
          <ProductForm
            onSave={handleCreate}
            onCancel={() => setView('detail')}
          />
        </div>
      );
    }

    if (view === 'edit' && selected) {
      return (
        <div className="p-6">
          <h2 className="text-lg font-semibold mb-4">Edit: {selected.name}</h2>
          <ProductForm
            initial={selected}
            onSave={handleEdit}
            onCancel={() => setView('detail')}
          />
        </div>
      );
    }

    if (view === 'add-port' && selected) {
      return (
        <div className="p-6">
          <h2 className="text-lg font-semibold mb-4">Add Port to {selected.name}</h2>
          <PortForm
            onSave={handleAddPort}
            onCancel={() => setView('detail')}
          />
        </div>
      );
    }

    if (view === 'edit-port' && editingPort) {
      return (
        <div className="p-6">
          <h2 className="text-lg font-semibold mb-4">Edit Port</h2>
          <PortForm
            initial={editingPort}
            onSave={handleEditPort}
            onCancel={() => { setView('detail'); setEditingPort(null); }}
          />
        </div>
      );
    }

    if (!selected) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
          <Package className="w-12 h-12 opacity-30" />
          <p className="text-sm">Select a product or create a new one</p>
          <Button size="sm" onClick={() => setView('create')}>
            <Plus className="w-4 h-4 mr-2" />
            New Product
          </Button>
        </div>
      );
    }

    const nextStates = NEXT_STATES[selected.status as ProductStatus] ?? [];

    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <LifecycleBadge status={selected.status} />
                {selected.domain && (
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                    {selected.domain}
                  </span>
                )}
                <span className="text-xs text-gray-400">v{selected.version}</span>
              </div>
              <h2 className="text-lg font-semibold">{selected.name}</h2>
              {selected.description && (
                <p className="text-sm text-gray-500 mt-1">{selected.description}</p>
              )}
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => setView('edit')}>
                <Edit3 className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleDelete(selected)}
                className="text-red-500 hover:text-red-700">
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Lifecycle controls */}
          {nextStates.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {nextStates
                .filter(ns => canGovernance || !GOVERNANCE_TRANSITIONS.includes(ns))
                .map(ns => (
                <Button
                  key={ns}
                  size="sm"
                  variant={ns === 'active' ? 'default' : 'outline'}
                  disabled={transitioning}
                  onClick={() => handleTransition(ns)}
                  className="flex items-center gap-1"
                >
                  <ArrowRight className="w-3 h-3" />
                  {TRANSITION_LABELS[ns] || ns}
                </Button>
              ))}
            </div>
          )}
        </div>

        {/* Ports */}
        <div className="flex-1 overflow-auto p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-sm flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-500" />
              Output Ports ({selected.ports?.length ?? 0})
            </h3>
            <Button size="sm" variant="outline" onClick={() => setView('add-port')}>
              <Plus className="w-3 h-3 mr-1" />
              Add Port
            </Button>
          </div>

          {!selected.ports?.length ? (
            <div className="text-center text-sm text-gray-400 py-8 border-2 border-dashed rounded-lg">
              No ports defined yet. Add one to expose data.
            </div>
          ) : (
            <div className="space-y-2">
              {selected.ports.map((port: any) => (
                <div key={port.id}
                  className="flex items-start justify-between p-3 rounded-lg border bg-gray-50 hover:bg-white transition-colors">
                  <div className="flex items-start gap-3">
                    <Database className="w-4 h-4 text-gray-400 mt-0.5" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{port.name}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${PORT_TYPE_COLORS[port.portType] ?? 'bg-gray-100 text-gray-600'}`}>
                          {port.portType}
                        </span>
                        <span className="text-xs text-gray-400 uppercase">{port.technology}</span>
                      </div>
                      {port.description && (
                        <p className="text-xs text-gray-500 mt-0.5">{port.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm"
                      onClick={() => { setEditingPort(port); setView('edit-port'); }}>
                      <Edit3 className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="sm"
                      onClick={() => handleDeletePort(port.id)}
                      className="text-red-400 hover:text-red-600">
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Metadata */}
          <div className="mt-6 pt-4 border-t text-xs text-gray-400 space-y-1">
            <div>Created: {new Date(selected.createdAt).toLocaleString()}</div>
            <div>Updated: {new Date(selected.updatedAt).toLocaleString()}</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen flex flex-col">
      <PageHeader
        icon={Package}
        title="Data Products"
        subtitle="Govern and publish data as versioned, lifecycle-managed products"
        actions={
          <Button size="sm" onClick={() => { setSelected(null); setView('create'); }}>
            <Plus className="w-4 h-4 mr-2" />
            New Product
          </Button>
        }
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Left — product list */}
        <div className="w-80 border-r flex flex-col">
          {/* Stats bar */}
          {stats && (
            <div className="px-4 py-3 border-b bg-gray-50 flex gap-3 text-xs flex-wrap">
              {Object.entries(stats as Record<string, number>)
                .filter(([, v]) => v > 0)
                .map(([k, v]) => (
                  <span key={k} className="flex items-center gap-1">
                    <span className="font-semibold">{v}</span>
                    <span className="text-gray-500">{k}</span>
                  </span>
                ))}
            </div>
          )}

          {/* Status filter */}
          <div className="px-3 py-2 border-b flex gap-1 flex-wrap">
            {STATUS_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                  statusFilter === f.value
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="flex-1 overflow-auto">
            {isLoading ? (
              <div className="p-4 text-sm text-gray-400">Loading…</div>
            ) : !products?.length ? (
              <div className="p-6 text-center text-sm text-gray-400">
                <GitBranch className="w-8 h-8 mx-auto mb-2 opacity-30" />
                No products yet
              </div>
            ) : (
              products.map((p: any) => (
                <button
                  key={p.id}
                  onClick={() => { setSelected(p); setView('detail'); }}
                  className={`w-full text-left px-4 py-3 border-b hover:bg-gray-50 transition-colors flex items-center justify-between ${
                    selected?.id === p.id ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <LifecycleBadge status={p.status} />
                      {p.domain && (
                        <span className="text-xs text-gray-400">{p.domain}</span>
                      )}
                    </div>
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-xs text-gray-400">
                      {p.ports?.length ?? 0} port{p.ports?.length !== 1 ? 's' : ''} · v{p.version}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right — detail / forms */}
        <div className="flex-1 overflow-hidden">
          {renderRightPanel()}
        </div>
      </div>
    </div>
  );
}
