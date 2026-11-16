import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, UserCog } from 'lucide-react';

import {
  AdminEmailList,
  AdminEmailListKind,
  addAdminEmail,
  listAdminEmails,
  removeAdminEmail,
} from '../../services/adminEmailListService';

// Mirrors the server's rule so obvious typos are caught before a round trip; the server re-validates
const EMAIL_PATTERN = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const MAX_EMAIL_LENGTH = 254;

export function validateAdminEmailInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === '') return 'Enter an email address.';
  if (trimmed.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(trimmed)) return 'Enter a valid email address.';
  return null;
}

function formatUpdatedAt(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

type Status = { kind: 'success' | 'error'; message: string } | null;

interface AdminEmailListSettingsProps {
  kind: AdminEmailListKind;
  title: string;
  description: string;
  helperText?: string;
}

function AdminEmailListSettings({ kind, title, description, helperText }: AdminEmailListSettingsProps) {
  const [list, setList] = useState<AdminEmailList | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    const result = await listAdminEmails(kind);
    if (result.success && result.data) {
      setList(result.data);
      setLoadError(null);
    } else {
      setLoadError(result.error || 'Failed to load the list');
    }
    setIsLoading(false);
  }, [kind]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const problem = validateAdminEmailInput(email);
    setValidationError(problem);
    setStatus(null);
    if (problem) return;
    setIsSaving(true);
    try {
      const result = await addAdminEmail(kind, email.trim());
      if (result.success && result.data) {
        setList(result.data);
        setEmail('');
        setStatus({ kind: 'success', message: result.message || 'Email added' });
      } else {
        setStatus({ kind: 'error', message: result.error || 'Failed to add the email' });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async (target: string) => {
    if (!window.confirm(`Remove ${target} from ${title}?`)) return;
    setStatus(null);
    setIsSaving(true);
    try {
      const result = await removeAdminEmail(kind, target);
      if (result.success && result.data) {
        setList(result.data);
        setStatus({ kind: 'success', message: result.message || `Removed ${target}` });
      } else {
        setStatus({ kind: 'error', message: result.error || 'Failed to remove the email' });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const headingId = `${kind}-heading`;
  const inputId = `${kind}-email`;
  const errorId = `${inputId}-error`;
  const envEmails = new Set((list?.envEmails || []).map((e) => e.toLowerCase()));
  const emails = list?.emails || [];
  const isBusy = isLoading || isSaving;

  const renderList = () => {
    if (isLoading && !list) {
      return <p role="status" aria-live="polite" className="text-sm text-gray-600">Loading…</p>;
    }
    if (!list) return null;
    if (emails.length === 0) {
      return <p className="text-sm text-gray-500">No one has been added yet.</p>;
    }
    return (
      <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200" aria-label={`${title} list`}>
        {emails.map((entry) => {
          const isEnv = envEmails.has(entry.toLowerCase());
          return (
            <li key={entry} className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="min-w-0 break-all text-sm text-gray-900">{entry}</span>
              {isEnv ? (
                <span className="inline-flex w-fit shrink-0 items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                  Set in server config
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => handleRemove(entry)}
                  disabled={isBusy}
                  aria-label={`Remove ${entry}`}
                  className="inline-flex w-fit shrink-0 items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-1 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Remove
                </button>
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <section className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-4 shadow-lg sm:p-6" aria-labelledby={headingId}>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600">
          <UserCog className="h-5 w-5 text-white" aria-hidden="true" />
        </div>
        <div>
          <h2 id={headingId} className="text-lg font-bold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-600">{description}</p>
        </div>
      </div>

      {loadError && (
        <p className="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          Could not load the list ({loadError}).
        </p>
      )}

      <form onSubmit={handleAdd} noValidate className="mb-4">
        <label htmlFor={inputId} className="mb-2 block text-sm font-semibold text-gray-800">
          Add email
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id={inputId}
            type="email"
            autoComplete="off"
            placeholder="name@company.com"
            value={email}
            disabled={isBusy}
            aria-invalid={Boolean(validationError)}
            aria-describedby={validationError ? errorId : undefined}
            onChange={(e) => {
              setEmail(e.target.value);
              setValidationError(null);
              setStatus(null);
            }}
            className={`w-full min-w-0 rounded-xl border-2 bg-white px-4 py-2.5 text-sm transition-colors focus:outline-none focus:ring-4 ${
              validationError
                ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
                : 'border-gray-200 focus:border-blue-500 focus:ring-blue-500/20'
            }`}
          />
          <button
            type="submit"
            disabled={isBusy}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {isSaving ? 'Saving…' : 'Add'}
          </button>
        </div>
        {validationError && (
          <p id={errorId} className="mt-1 text-sm font-medium text-red-600" role="alert">{validationError}</p>
        )}
      </form>

      <div aria-live="polite">
        {status && (
          <p
            role={status.kind === 'error' ? 'alert' : 'status'}
            className={`mb-4 rounded-lg px-3 py-2 text-sm font-medium ${
              status.kind === 'success' ? 'border border-green-300 bg-green-50 text-green-800' : 'border border-red-300 bg-red-50 text-red-700'
            }`}
          >
            {status.message}
          </p>
        )}
      </div>

      {renderList()}

      {helperText && <p className="mt-3 text-xs text-gray-500">{helperText}</p>}
      {list && (list.updatedBy || list.updatedAt) && (
        <p className="mt-2 text-xs text-gray-500">
          {`Last updated${list.updatedBy ? ` by ${list.updatedBy}` : ''}${list.updatedAt ? ` at ${formatUpdatedAt(list.updatedAt)}` : ''}`}
        </p>
      )}
    </section>
  );
}

export default AdminEmailListSettings;
