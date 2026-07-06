import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Edit,
  Trash2,
  Search,
  Loader2,
  Layers,
  CheckCircle,
  AlertCircle,
  X,
  Download,
  Upload
} from 'lucide-react';
import { BACKEND_URL } from '../config/api';
import { useAuth } from '../hooks/useAuth';

function getAuthHeaders(): Record<string, string> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('cpq_token') : null;
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

interface Combination {
  id: string;
  value: string;
  label: string;
  migrationType: string;
  displayOrder: number;
  requiresUsers?: boolean;
  createdAt?: string;
  updatedAt?: string;
  hasFile?: boolean;
  fileName?: string;
}

// Map old migration types to new service plan structure
const SERVICE_PLANS = ['Migrate', 'Manage', 'Bundle'] as const;
const COMBINATION_TYPES_BY_PLAN: Record<string, string[]> = {
  'Migrate': ['Combination', 'Overage'],
  'Manage': ['Manage'],
  'Bundle': ['Bundle']
};

// Map between display names and backend migrationType values
const MIGRATION_TYPE_MAP: Record<string, string> = {
  'Migrate-Combination': 'Multi combination',
  'Migrate-Overage': 'Overage Agreement',
  'Manage-Manage': 'Manage',
  'Bundle-Bundle': 'Bundle'
};

const CombinationManager: React.FC = () => {
  const { user } = useAuth();
  const canDeleteCombinations = user?.role === 'exhibit_admin';
  const [combinations, setCombinations] = useState<Combination[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterMigrationType, setFilterMigrationType] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingCombo, setEditingCombo] = useState<Combination | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [formData, setFormData] = useState({ value: '', label: '', migrationType: 'Content', displayOrder: 999, requiresUsers: true });
  const [formFile, setFormFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadCombinations = async () => {
    try {
      setIsLoading(true);
      // Always load all combinations - filter on client side
      const url = `${BACKEND_URL}/api/combinations`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setCombinations(data.combinations || []);
      }
    } catch (e) {
      console.error('Error loading combinations:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCombinations();
  }, [filterMigrationType]);

  const getServicePlanMigrationTypes = (servicePlan: string): string[] => {
    // Map service plan to migration types
    if (servicePlan === 'Migrate') return ['Multi combination', 'Overage Agreement'];
    if (servicePlan === 'Manage') return ['Manage'];
    if (servicePlan === 'Bundle') return ['Bundle'];
    return []; // For legacy types, return empty (will match nothing)
  };

  const filteredList = combinations.filter(
    (c) =>
      (!searchTerm ||
        c.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.value.toLowerCase().includes(searchTerm.toLowerCase())) &&
      (!filterMigrationType ||
        c.migrationType === filterMigrationType ||
        getServicePlanMigrationTypes(filterMigrationType).includes(c.migrationType))
  );

  const openAdd = () => {
    setEditingCombo(null);
    setFormData({ value: '', label: '', migrationType: 'Multi combination', displayOrder: 999, requiresUsers: true });
    setFormFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setSubmitError(null);
    setSubmitSuccess(null);
    setShowFormModal(true);
  };

  const openEdit = (c: Combination) => {
    setEditingCombo(c);
    setFormData({
      value: c.value,
      label: c.label,
      migrationType: c.migrationType,
      displayOrder: c.displayOrder ?? 999,
      requiresUsers: c.requiresUsers !== false
    });
    setFormFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setSubmitError(null);
    setSubmitSuccess(null);
    setShowFormModal(true);
  };

  const closeModal = () => {
    setShowFormModal(false);
    setEditingCombo(null);
    setDeleteConfirm(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);
    setIsSubmitting(true);
    try {
      const value = formData.value.trim() || formData.label.trim().toLowerCase().replace(/\s+/g, '-');
      const label = formData.label.trim();
      const migrationType = formData.migrationType;
      const displayOrder = formData.displayOrder;
      const requiresUsers = migrationType === 'Manage' ? formData.requiresUsers : undefined;
      if (editingCombo) {
        const res = await fetch(`${BACKEND_URL}/api/combinations/${editingCombo.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value, label, migrationType, displayOrder, requiresUsers })
        });
        const data = await res.json();
        if (!res.ok) {
          setSubmitError(data.error || 'Update failed');
          return;
        }
        let updatedCombo = data.combination;
        if (formFile) {
          const fd = new FormData();
          fd.append('file', formFile);
          const fileRes = await fetch(`${BACKEND_URL}/api/combinations/${editingCombo.id}/file`, {
            method: 'POST',
            body: fd
          });
          const fileData = await fileRes.json();
          if (fileRes.ok && fileData.combination) {
            updatedCombo = fileData.combination;
          }
        }
        setSubmitSuccess(formFile ? 'Combination and template file updated.' : 'Combination updated.');
        setCombinations((prev) => prev.map((c) => (c.id === editingCombo.id ? (updatedCombo || c) : c)));
        window.dispatchEvent(new CustomEvent('combinationsUpdated'));
      } else {
        if (formFile) {
          const fd = new FormData();
          fd.append('value', value);
          fd.append('label', label);
          fd.append('migrationType', migrationType);
          fd.append('displayOrder', String(displayOrder));
          if (requiresUsers !== undefined) fd.append('requiresUsers', String(requiresUsers));
          fd.append('file', formFile);
          const res = await fetch(`${BACKEND_URL}/api/combinations`, {
            method: 'POST',
            body: fd
          });
          const data = await res.json();
          if (!res.ok) {
            setSubmitError(data.error || 'Create failed');
            return;
          }
          setSubmitSuccess('Combination added with file.');
          setCombinations((prev) => [...prev, data.combination].sort((a, b) => (a.displayOrder || 999) - (b.displayOrder || 999)));
          window.dispatchEvent(new CustomEvent('combinationsUpdated'));
        } else {
          const res = await fetch(`${BACKEND_URL}/api/combinations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value, label, migrationType, displayOrder, requiresUsers })
          });
          const data = await res.json();
          if (!res.ok) {
            setSubmitError(data.error || 'Create failed');
            return;
          }
          setSubmitSuccess('Combination added.');
          setCombinations((prev) => [...prev, data.combination].sort((a, b) => (a.displayOrder || 999) - (b.displayOrder || 999)));
          window.dispatchEvent(new CustomEvent('combinationsUpdated'));
        }
      }
      setTimeout(closeModal, 1200);
    } catch (err: any) {
      setSubmitError(err.message || 'Request failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/combinations/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) {
        setDeleteConfirm(null);
        alert(data.error || 'Delete failed');
        return;
      }
      setCombinations((prev) => prev.filter((c) => c.id !== id));
      setDeleteConfirm(null);
      window.dispatchEvent(new CustomEvent('combinationsUpdated'));
    } catch (err: any) {
      setSubmitError(err.message || 'Delete failed');
    }
  };


  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
          <Layers className="w-8 h-8 text-indigo-600" />
          Combination Manager
        </h1>
        <p className="text-gray-600">
          Add and edit combinations shown in the Configure page when users select a migration type (Messaging, Content, Email, Multi combination, Overage).
        </p>
      </div>

      {submitError && (
        <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-800">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{submitError}</span>
          <button type="button" onClick={() => setSubmitError(null)} className="ml-auto p-1 hover:bg-red-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {submitSuccess && (
        <div className="mb-4 p-4 rounded-lg bg-green-50 border border-green-200 flex items-center gap-2 text-green-800">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <span>{submitSuccess}</span>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by label or value..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <select
            value={filterMigrationType}
            onChange={(e) => setFilterMigrationType(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All service plans</option>
            {SERVICE_PLANS.map((plan) => (
              <option key={plan} value={plan}>{plan}</option>
            ))}
            <optgroup label="Legacy">
              <option value="Messaging">Messaging (Legacy)</option>
              <option value="Content">Content (Legacy)</option>
              <option value="Email">Email (Legacy)</option>
            </optgroup>
          </select>
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
          >
            <Plus className="w-5 h-5" />
            Add combination
          </button>
        </div>

        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-12 flex justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
          ) : filteredList.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              No combinations found. Click &quot;Add combination&quot; to create one.
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Value (slug)</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Label</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Migration type</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Order</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">File</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredList.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="py-3 px-4 font-mono text-sm text-gray-700">{c.value}</td>
                    <td className="py-3 px-4 text-gray-900">{c.label}</td>
                    <td className="py-3 px-4 text-gray-600">{c.migrationType}</td>
                    <td className="py-3 px-4 text-gray-600">{c.displayOrder ?? 999}</td>
                    <td className="py-3 px-4">
                      {c.hasFile ? (
                        <a
                          href={`${BACKEND_URL}/api/combinations/${c.id}/file`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-indigo-600 hover:underline text-sm"
                        >
                          <Download className="w-4 h-4" />
                          {c.fileName || 'Download'}
                        </a>
                      ) : (
                        <span className="text-gray-400 text-sm">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {deleteConfirm === c.id ? (
                        <span className="flex items-center justify-end gap-2">
                          <span className="text-sm text-red-600">Delete?</span>
                          <button
                            type="button"
                            onClick={() => handleDelete(c.id)}
                            className="text-red-600 hover:underline text-sm font-medium"
                          >
                            Yes
                          </button>
                          <button type="button" onClick={() => setDeleteConfirm(null)} className="text-gray-600 hover:underline text-sm">
                            No
                          </button>
                        </span>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => openEdit(c)}
                            className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg mr-1"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          {canDeleteCombinations && (
                            <button
                              type="button"
                              onClick={() => setDeleteConfirm(c.id)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showFormModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={closeModal}>
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editingCombo ? 'Edit combination' : 'Add combination'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Service Plan *</label>
                <select
                  required
                  value={formData.migrationType ? Object.entries(MIGRATION_TYPE_MAP).find(([_, v]) => v === formData.migrationType)?.[0]?.split('-')[0] || '' : ''}
                  onChange={(e) => {
                    const selectedPlan = e.target.value;
                    const firstCombinationType = COMBINATION_TYPES_BY_PLAN[selectedPlan]?.[0];
                    const key = `${selectedPlan}-${firstCombinationType}`;
                    setFormData((p) => ({ ...p, migrationType: MIGRATION_TYPE_MAP[key] || '' }));
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select Service Plan</option>
                  {SERVICE_PLANS.map((plan) => (
                    <option key={plan} value={plan}>{plan}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Combination Type *</label>
                <select
                  required
                  value={formData.migrationType ? Object.entries(MIGRATION_TYPE_MAP).find(([_, v]) => v === formData.migrationType)?.[0]?.split('-')[1] || '' : ''}
                  onChange={(e) => {
                    const selectedType = e.target.value;
                    const selectedPlan = Object.entries(MIGRATION_TYPE_MAP).find(([_, v]) => v === formData.migrationType)?.[0]?.split('-')[0] || '';
                    const key = `${selectedPlan}-${selectedType}`;
                    setFormData((p) => ({ ...p, migrationType: MIGRATION_TYPE_MAP[key] || '' }));
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select Combination Type</option>
                  {(() => {
                    const selectedPlan = Object.entries(MIGRATION_TYPE_MAP).find(([_, v]) => v === formData.migrationType)?.[0]?.split('-')[0] || '';
                    return COMBINATION_TYPES_BY_PLAN[selectedPlan]?.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    )) || [];
                  })()}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Label (display text) *</label>
                <input
                  type="text"
                  required
                  value={formData.label}
                  onChange={(e) => setFormData((p) => ({ ...p, label: e.target.value }))}
                  placeholder="e.g. SLACK TO TEAMS"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Value (slug, used in config) *</label>
                <input
                  type="text"
                  required
                  value={formData.value}
                  onChange={(e) => setFormData((p) => ({ ...p, value: e.target.value }))}
                  placeholder="e.g. slack-to-teams"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">Use lowercase and hyphens. If empty, generated from label.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Display order</label>
                <input
                  type="number"
                  min={0}
                  value={formData.displayOrder}
                  onChange={(e) => setFormData((p) => ({ ...p, displayOrder: parseInt(e.target.value, 10) || 999 }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {formData.migrationType === 'Manage' && (
                <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <input
                    type="checkbox"
                    id="requiresUsers"
                    checked={formData.requiresUsers}
                    onChange={(e) => setFormData((p) => ({ ...p, requiresUsers: e.target.checked }))}
                    className="w-4 h-4 text-indigo-600 rounded"
                  />
                  <label htmlFor="requiresUsers" className="text-sm font-medium text-gray-700 cursor-pointer">
                    Show "Number of Users" field for this agreement
                  </label>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Upload className="w-4 h-4 inline mr-1" />
                  {editingCombo ? 'Replace template file (optional)' : 'Upload template file (optional)'}
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".docx,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
                  onChange={(e) => setFormFile(e.target.files?.[0] ?? null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">Backend combination template: DOCX or PDF. Stored and used for agreement generation.</p>
                {editingCombo && editingCombo.hasFile && !formFile && (
                  <p className="text-xs text-blue-600 mt-1">Current file: {editingCombo.fileName || 'attached'}. Choose a new file to replace.</p>
                )}
                {formFile && <p className="text-xs text-green-600 mt-1">{formFile.name}</p>}
              </div>
              {submitError && <p className="text-sm text-red-600">{submitError}</p>}
              {submitSuccess && <p className="text-sm text-green-600">{submitSuccess}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeModal} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingCombo ? 'Update' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CombinationManager;
