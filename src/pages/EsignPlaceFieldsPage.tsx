import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Rnd } from 'react-rnd';
import { v4 as uuidv4 } from 'uuid';
import { PenLine, Loader2, Mail, Type, Briefcase, Calendar, UserPlus, Trash2, Bookmark, Plus, Users, Pencil, ChevronDown, ChevronUp, ArrowUp, ArrowDown, Star } from 'lucide-react';
import { BACKEND_URL } from '../config/api';
import EsignPdfPageView, { FieldCoords } from '../components/EsignPdfPageView';
import { validateSignatureFieldsBeforeSend } from '../utils/esignSendValidation';

const QUOTE_PENDING_APPROVAL_KEY = 'quotePendingApproval';
const SAVED_RECIPIENTS_KEY = 'esign_saved_recipients';
const SAVED_GROUPS_KEY = 'esign_saved_groups';
const DEFAULT_GROUP_KEY = 'esign_default_group_id';

function getDefaultGroupId(): string | null {
  try {
    return localStorage.getItem(DEFAULT_GROUP_KEY);
  } catch {
    return null;
  }
}

function setDefaultGroupIdInStorage(id: string | null) {
  try {
    if (id) localStorage.setItem(DEFAULT_GROUP_KEY, id);
    else localStorage.removeItem(DEFAULT_GROUP_KEY);
  } catch (e) {
    console.warn('Failed to save default group', e);
  }
}

export interface SavedRecipient {
  id: string;
  name: string;
  email: string;
  role: 'signer' | 'reviewer';
}

export interface SavedGroup {
  id: string;
  name: string;
  recipients: { name: string; email: string; role: 'signer' | 'reviewer' }[];
}

function getSavedRecipients(): SavedRecipient[] {
  try {
    const raw = localStorage.getItem(SAVED_RECIPIENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecipientsToStorage(list: SavedRecipient[]) {
  try {
    localStorage.setItem(SAVED_RECIPIENTS_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('Failed to save recipients to storage', e);
  }
}

function getSavedGroups(): SavedGroup[] {
  try {
    const raw = localStorage.getItem(SAVED_GROUPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveGroupsToStorage(list: SavedGroup[]) {
  try {
    localStorage.setItem(SAVED_GROUPS_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('Failed to save groups to storage', e);
  }
}

export interface QuotePendingApproval {
  documentId: string;
  esignId: string;
  clientName: string;
  amount: number;
  approvalEmails: { role1: string; role2: string; role4: string };
  teamId: string;
  teamEmail: string;
  creatorEmail: string;
  creatorName: string;
  quoteId?: string;
  isOverage?: boolean;
  additionalRecipients?: string[];
}

const PDF_SCALE = 1.5;
/** Minimum field size in pixels (used by Rnd and for persistence) */
const MIN_FIELD_WIDTH_PX = 120;
const MIN_FIELD_HEIGHT_PX = 40;

export type FieldType = 'signature' | 'name' | 'title' | 'date';

export interface EsignRecipient {
  id: string;
  name: string;
  email: string;
  role: string;
  action?: 'signer' | 'reviewer' | null;
  status?: string;
  email_message?: string | null;
}

interface PlacedField {
  id: string;
  type: FieldType;
  page: number;
  recipient_id?: string | null;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /** 0–1 relative to page width/height — keeps sign view aligned with pdf-lib */
  xNorm?: number;
  yNorm?: number;
  widthNorm?: number;
  heightNorm?: number;
  xPct?: number;
  yPct?: number;
  widthPct?: number;
  heightPct?: number;
}

const FIELD_DEFS: { type: FieldType; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { type: 'signature', label: 'Signature', Icon: PenLine },
  { type: 'name', label: 'Name', Icon: Type },
  { type: 'title', label: 'Title', Icon: Briefcase },
  { type: 'date', label: 'Date', Icon: Calendar },
];

/** Per-recipient colors for field overlays and recipient list. Use full class names so Tailwind includes them. */
const RECIPIENT_COLORS = [
  { box: 'bg-sky-100 border-2 border-sky-500 text-sky-800 hover:bg-sky-200', dot: 'bg-sky-500' },
  { box: 'bg-emerald-100 border-2 border-emerald-500 text-emerald-800 hover:bg-emerald-200', dot: 'bg-emerald-500' },
  { box: 'bg-amber-100 border-2 border-amber-500 text-amber-800 hover:bg-amber-200', dot: 'bg-amber-500' },
  { box: 'bg-violet-100 border-2 border-violet-500 text-violet-800 hover:bg-violet-200', dot: 'bg-violet-500' },
  { box: 'bg-rose-100 border-2 border-rose-500 text-rose-800 hover:bg-rose-200', dot: 'bg-rose-500' },
  { box: 'bg-cyan-100 border-2 border-cyan-500 text-cyan-800 hover:bg-cyan-200', dot: 'bg-cyan-500' },
];
const UNASSIGNED_COLOR = { box: 'bg-slate-100 border-2 border-slate-400 text-slate-700 hover:bg-slate-200', dot: 'bg-slate-400' };

function getRoleDisplayLabel(role: string): string {
  const r = (role || 'signer').trim();
  if (r === 'Team Lead' || r === 'Team Approval') return 'Team Lead';
  if (r === 'Technical Team') return 'Technical Team';
  if (r === 'Legal Team') return 'Legal Team';
  if (r.toLowerCase() === 'reviewer') return 'Reviewer';
  return 'Signer';
}

function getRecipientColor(
  recipientId: string | null | undefined,
  recipients: EsignRecipient[]
): { box: string; dot: string } {
  if (!recipientId || !recipients.length) return UNASSIGNED_COLOR;
  const idx = recipients.findIndex((r) => r.id === recipientId);
  if (idx < 0) return UNASSIGNED_COLOR;
  return RECIPIENT_COLORS[idx % RECIPIENT_COLORS.length] ?? UNASSIGNED_COLOR;
}

const EsignPlaceFieldsPage: React.FC = () => {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();

  const [doc, setDoc] = useState<{ file_name: string; status: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signatureFields, setSignatureFields] = useState<PlacedField[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [dragSource, setDragSource] = useState<FieldType | null>(null);
  const [recipients, setRecipients] = useState<EsignRecipient[]>([]);
  const [selectedRecipientId, setSelectedRecipientId] = useState<string | null>(null);
  const [newRecipient, setNewRecipient] = useState({ name: '', email: '', role: 'signer' as 'signer' | 'reviewer' });
  const [recipientError, setRecipientError] = useState<string | null>(null);
  const [addingRecipient, setAddingRecipient] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageMetricsRef = useRef<Record<number, { wPt: number; hPt: number }>>({});
  const [pageDimsTick, setPageDimsTick] = useState(0);
  const [pendingApproval, setPendingApproval] = useState<QuotePendingApproval | null>(null);
  const [sendingApproval, setSendingApproval] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [sendForSignatureResult, setSendForSignatureResult] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sequential, setSequential] = useState(false);
  const [savedRecipients, setSavedRecipients] = useState<SavedRecipient[]>(() => getSavedRecipients());
  const [savedGroups, setSavedGroups] = useState<SavedGroup[]>(() => getSavedGroups());
  const [defaultGroupId, setDefaultGroupIdState] = useState<string | null>(() => getDefaultGroupId());
  const [groupNameInput, setGroupNameInput] = useState('');
  /** When editing a group, this holds the group id and a draft of name + recipients */
  const [editingGroup, setEditingGroup] = useState<{ id: string; name: string; recipients: { name: string; email: string; role: 'signer' | 'reviewer' }[] } | null>(null);
  /** Group id when "View" is expanded to show who's in the group */
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const fileUrl = doc ? `${BACKEND_URL}/api/esign/documents/${documentId}/file?inline=1` : '';

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(QUOTE_PENDING_APPROVAL_KEY);
      if (!raw) {
        setPendingApproval(null);
        return;
      }
      const data = JSON.parse(raw) as QuotePendingApproval;
      if (data.esignId === documentId && data.documentId && data.teamEmail && data.approvalEmails?.role1) {
        setPendingApproval(data);
      } else {
        setPendingApproval(null);
      }
    } catch {
      setPendingApproval(null);
    }
  }, [documentId]);

  useEffect(() => {
    if (!documentId) return;
    (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/esign/documents/${documentId}`);
        const data = await res.json();
        if (data.success) {
          setDoc(data.document);
        } else {
          navigate('/esign');
        }
      } catch {
        navigate('/esign');
      } finally {
        setLoading(false);
      }
    })();
  }, [documentId, navigate]);

  useEffect(() => {
    if (!documentId) return;
    (async () => {
      const [fieldsRes, recipientsRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/esign/signature-fields/${documentId}`),
        fetch(`${BACKEND_URL}/api/esign/documents/${documentId}/recipients`),
      ]);
      const fieldsData = await fieldsRes.json();
      const recipientsData = await recipientsRes.json();
      if (recipientsData.success && recipientsData.recipients?.length) {
        setRecipients(recipientsData.recipients);
        setSelectedRecipientId(recipientsData.recipients[0]?.id || null);
        if (recipientsData.recipients.length >= 2) setSequential(true);
      }
      // Default group is no longer auto-added when document has no recipients.
      // Add recipients via "Add to document" on a saved group.
      if (fieldsData.success && fieldsData.fields?.length) {
        setSignatureFields(
          fieldsData.fields.map((f: any) => {
            const page = f.page || 1;
            const id = f._id?.toString() || uuidv4();
            const recipient_id = f.recipient_id?.toString() || null;
            if (f.x != null && f.y != null) {
              return {
                id,
                type: (f.type || 'signature') as FieldType,
                page,
                recipient_id,
                x: Number(f.x),
                y: Number(f.y),
                width: Number(f.width) || 120,
                height: Number(f.height) || 40,
                ...(f.xNorm != null && f.yNorm != null && f.widthNorm != null && f.heightNorm != null
                  ? {
                      xNorm: Number(f.xNorm),
                      yNorm: Number(f.yNorm),
                      widthNorm: Number(f.widthNorm),
                      heightNorm: Number(f.heightNorm),
                    }
                  : {}),
              };
            }
            return {
              id,
              type: (f.type || 'signature') as FieldType,
              page,
              recipient_id,
              xPct: f.xPct ?? 10,
              yPct: f.yPct ?? 80,
              widthPct: f.widthPct ?? 20,
              heightPct: f.heightPct ?? 4,
            };
          })
        );
      }
    })();
  }, [documentId]);

  const handlePageDimensions = useCallback((info: { pageNumber: number; widthPt: number; heightPt: number }) => {
    pageMetricsRef.current[info.pageNumber] = { wPt: info.widthPt, hPt: info.heightPt };
    setPageDimsTick((t) => t + 1);
  }, []);


  const fieldsToApiPayload = useCallback((list: PlacedField[]) => {
    return list.map((f) => {
      const base = { page: f.page, type: f.type, recipient_id: f.recipient_id || null };
      if (f.x == null || f.y == null) {
        return { ...base, xPct: f.xPct ?? 10, yPct: f.yPct ?? 80, widthPct: f.widthPct ?? 20, heightPct: f.heightPct ?? 4 };
      }
      const w = Math.max(MIN_FIELD_WIDTH_PX / PDF_SCALE, f.width ?? 120);
      const h = Math.max(MIN_FIELD_HEIGHT_PX / PDF_SCALE, f.height ?? 40);
      const pm = pageMetricsRef.current[f.page];
      const row: Record<string, unknown> = { ...base, x: f.x, y: f.y, width: w, height: h };
      if (pm) {
        row.xNorm = f.x / pm.wPt;
        row.yNorm = f.y / pm.hPt;
        row.widthNorm = w / pm.wPt;
        row.heightNorm = h / pm.hPt;
      } else if (f.xNorm != null && f.yNorm != null && f.widthNorm != null && f.heightNorm != null) {
        row.xNorm = f.xNorm;
        row.yNorm = f.yNorm;
        row.widthNorm = f.widthNorm;
        row.heightNorm = f.heightNorm;
      }
      return row;
    });
  }, []);

  const saveRecipientsAndSet = useCallback(async (list: EsignRecipient[], selectLast?: boolean) => {
    if (!documentId) return { success: false };
    setRecipientError(null);
    let data: { success?: boolean; recipients?: EsignRecipient[]; error?: string } = { success: false };
    try {
      const res = await fetch(`${BACKEND_URL}/api/esign/documents/${documentId}/recipients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: list.map((r) => ({
            name: r.name,
            email: r.email,
            role: r.role || 'signer',
            ...(r.action ? { action: r.action } : {}),
            ...(r.email_message != null && r.email_message.trim() !== '' ? { email_message: r.email_message.trim() } : {}),
          })),
        }),
      });
      const text = await res.text();
      try {
        data = JSON.parse(text);
      } catch {
        const msg = res.ok ? 'Server returned invalid JSON' : `Request failed (${res.status}). Check that the backend is running at ${BACKEND_URL}.`;
        setRecipientError(msg);
        return { success: false };
      }
      if (!res.ok) {
        setRecipientError(data.error || `Request failed (${res.status})`);
        return { success: false };
      }
      if (data.success && Array.isArray(data.recipients)) {
        setRecipients(data.recipients);
        if (data.recipients.length > 0) {
          if (selectLast) setSelectedRecipientId(data.recipients[data.recipients.length - 1]?.id || null);
          else setSelectedRecipientId((prev) => (data.recipients!.some((r: EsignRecipient) => r.id === prev) ? prev : data.recipients![0]?.id || null));
        }
        return { success: true };
      }
      setRecipientError(data.error || 'Failed to save recipients');
      return { success: false };
    } catch (err: any) {
      const msg = err?.message?.includes('fetch') || err?.message?.includes('Network')
        ? `Cannot reach server. Is it running at ${BACKEND_URL}?`
        : (err?.message || 'Failed to save recipients');
      setRecipientError(msg);
      return { success: false };
    }
  }, [documentId]);

  const addRecipient = async () => {
    const name = newRecipient.name.trim();
    const email = newRecipient.email.trim();
    if (!email) {
      setRecipientError('Email is required');
      return;
    }
    setRecipientError(null);
    setAddingRecipient(true);
    const role = newRecipient.role || 'signer';
    const optimistic: EsignRecipient = {
      id: `temp-${Date.now()}`,
      name: name || email,
      email,
      role,
    };
    setRecipients((prev) => [...prev, optimistic]);
    setSelectedRecipientId(optimistic.id);
    setNewRecipient({ name: '', email: '', role: 'signer' });
    const listToSave = [...recipients, { id: '', name: name || email, email, role }];
    const result = await saveRecipientsAndSet(listToSave, true);
    setAddingRecipient(false);
    if (!result.success) {
      setRecipients((prev) => prev.filter((r) => r.id !== optimistic.id));
      setSelectedRecipientId(recipients[0]?.id || null);
      setNewRecipient({ name: name || '', email, role: newRecipient.role || 'signer' });
    }
  };

  const updateRecipientRole = async (recipientId: string, newRole: string) => {
    const updated = recipients.map((r) => {
      if (r.id !== recipientId) return r;
      const isGeneric = newRole === 'signer' || newRole === 'reviewer';
      return { ...r, role: newRole, ...(isGeneric ? { action: undefined } : {}) };
    });
    setRecipients(updated);
    await saveRecipientsAndSet(updated);
  };

  const updateRecipientAction = async (recipientId: string, action: 'signer' | 'reviewer') => {
    const updated = recipients.map((r) => (r.id === recipientId ? { ...r, action } : r));
    setRecipients(updated);
    await saveRecipientsAndSet(updated);
  };

  const removeRecipient = async (id: string) => {
    const newList = recipients.filter((r) => r.id !== id);
    setSignatureFields((prev) => prev.map((f) => (f.recipient_id === id ? { ...f, recipient_id: null } : f)));
    if (newList.length) await saveRecipientsAndSet(newList);
    else if (documentId) {
      await fetch(`${BACKEND_URL}/api/esign/documents/${documentId}/recipients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipients: [] }),
      });
      setRecipients([]);
      setSelectedRecipientId(null);
    }
  };

  const moveRecipientUp = async (index: number) => {
    if (index <= 0 || index >= recipients.length) return;
    const newList = [...recipients];
    [newList[index - 1], newList[index]] = [newList[index], newList[index - 1]];
    await saveRecipientsAndSet(newList);
  };

  const moveRecipientDown = async (index: number) => {
    if (index < 0 || index >= recipients.length - 1) return;
    const newList = [...recipients];
    [newList[index], newList[index + 1]] = [newList[index + 1], newList[index]];
    await saveRecipientsAndSet(newList);
  };

  const saveCurrentRecipientsToSaved = () => {
    const current = recipients.map((r) => ({
      id: r.id.startsWith('temp-') ? `saved-${r.email}-${Date.now()}` : r.id,
      name: r.name || r.email,
      email: r.email,
      role: ((r.role || 'signer').toLowerCase() === 'reviewer' ? 'reviewer' : 'signer') as 'signer' | 'reviewer',
    }));
    const existing = getSavedRecipients();
    const byEmail = new Map(existing.map((s) => [s.email.toLowerCase(), s]));
    current.forEach((c) => {
      byEmail.set(c.email.toLowerCase(), { ...c, id: byEmail.get(c.email.toLowerCase())?.id ?? c.id });
    });
    const merged = Array.from(byEmail.values());
    saveRecipientsToStorage(merged);
    setSavedRecipients(merged);
  };

  const addFromSaved = async (saved: SavedRecipient) => {
    const listToSave = [...recipients, { id: '', name: saved.name || saved.email, email: saved.email, role: saved.role }];
    const result = await saveRecipientsAndSet(listToSave, true);
    if (!result.success) setRecipientError('Failed to add recipient');
  };

  const removeSavedRecipient = (id: string) => {
    const next = savedRecipients.filter((s) => s.id !== id);
    saveRecipientsToStorage(next);
    setSavedRecipients(next);
  };

  const saveCurrentAsGroup = () => {
    const name = groupNameInput.trim();
    if (!name || recipients.length === 0) return;
    const newGroup: SavedGroup = {
      id: `group-${Date.now()}`,
      name,
      recipients: recipients.map((r) => ({
        name: r.name || r.email,
        email: r.email,
        role: ((r.role || 'signer').toLowerCase() === 'reviewer' ? 'reviewer' : 'signer') as 'signer' | 'reviewer',
      })),
    };
    const next = [...savedGroups, newGroup];
    saveGroupsToStorage(next);
    setSavedGroups(next);
    setGroupNameInput('');
  };

  const SOW_ROLES = ['Team Lead', 'Technical Team', 'Legal Team'];
  const SOW_ACTIONS: ('signer' | 'reviewer')[] = ['signer', 'reviewer', 'reviewer'];
  const addGroupToDocument = async (group: SavedGroup) => {
    const existingEmails = new Set(recipients.map((r) => r.email.toLowerCase()));
    const toAdd = group.recipients.filter((g) => !existingEmails.has(g.email.toLowerCase()));
    if (toAdd.length === 0) {
      setRecipientError('All members of this group are already added');
      return;
    }
    const isDefaultGroup = group.id === defaultGroupId;
    const listToSave = [
      ...recipients,
      ...toAdd.map((g, idx) => ({
        id: '' as string,
        name: g.name || g.email,
        email: g.email,
        role: isDefaultGroup && idx < SOW_ROLES.length ? SOW_ROLES[idx] : g.role,
        action: isDefaultGroup && idx < SOW_ACTIONS.length ? SOW_ACTIONS[idx] : undefined,
      })),
    ];
    const result = await saveRecipientsAndSet(listToSave, true);
    if (!result.success) setRecipientError('Failed to add group');
    else setRecipientError(null);
  };

  const setDefaultGroup = (id: string | null) => {
    setDefaultGroupIdState(id);
    setDefaultGroupIdInStorage(id);
  };

  const removeGroup = (id: string) => {
    const next = savedGroups.filter((g) => g.id !== id);
    saveGroupsToStorage(next);
    setSavedGroups(next);
    if (editingGroup?.id === id) setEditingGroup(null);
    if (defaultGroupId === id) setDefaultGroup(null);
  };

  const startEditingGroup = (g: SavedGroup) => {
    setExpandedGroupId(null);
    setEditingGroup({
      id: g.id,
      name: g.name,
      recipients: g.recipients.map((r) => ({ ...r })),
    });
  };

  const updateEditingGroupName = (name: string) => {
    setEditingGroup((prev) => (prev ? { ...prev, name } : null));
  };

  const updateEditingGroupRecipient = (index: number, field: 'name' | 'email' | 'role', value: string) => {
    setEditingGroup((prev) => {
      if (!prev || index < 0 || index >= prev.recipients.length) return prev;
      const next = prev.recipients.map((r, i) =>
        i === index ? { ...r, [field]: field === 'role' ? value as 'signer' | 'reviewer' : value } : r
      );
      return { ...prev, recipients: next };
    });
  };

  const removeRecipientFromEditingGroup = (index: number) => {
    setEditingGroup((prev) => {
      if (!prev || index < 0 || index >= prev.recipients.length) return prev;
      const next = prev.recipients.filter((_, i) => i !== index);
      return { ...prev, recipients: next };
    });
  };

  const addRecipientToEditingGroup = () => {
    setEditingGroup((prev) => {
      if (!prev) return prev;
      return { ...prev, recipients: [...prev.recipients, { name: '', email: '', role: 'signer' }] };
    });
  };

  const saveEditingGroup = () => {
    if (!editingGroup) return;
    const name = editingGroup.name.trim();
    const recipients = editingGroup.recipients.filter((r) => r.email.trim());
    if (!name || recipients.length === 0) return;
    const next = savedGroups.map((g) =>
      g.id === editingGroup.id
        ? { ...g, name, recipients }
        : g
    );
    saveGroupsToStorage(next);
    setSavedGroups(next);
    setEditingGroup(null);
  };

  /** Persist fields to backend (pass updated list after drag/resize so size and position are saved). */
  const saveFieldsToBackend = useCallback(
    async (fieldsToSave: PlacedField[]) => {
      if (!documentId || !fieldsToSave.length) return;
      const payload = fieldsToApiPayload(fieldsToSave);
      try {
        await fetch(`${BACKEND_URL}/api/esign/signature-fields`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ document_id: documentId, fields: payload }),
        });
      } catch (err) {
        console.warn('Failed to auto-save field positions:', err);
      }
    },
    [documentId, fieldsToApiPayload]
  );

  /** After every page that has fields has reported dimensions, add xNorm/yNorm to legacy rows and save once. */
  useEffect(() => {
    if (!documentId || !signatureFields.length) return;
    const pointFields = signatureFields.filter((f) => f.x != null && f.y != null);
    if (!pointFields.some((f) => f.xNorm == null)) return;
    const pages = [...new Set(pointFields.map((f) => f.page))];
    const m = pageMetricsRef.current;
    if (!pages.every((p) => m[p])) return;
    const next = signatureFields.map((f) => {
      if (f.x == null || f.y == null || f.xNorm != null) return f;
      const pm = m[f.page];
      if (!pm) return f;
      const w = Math.max(MIN_FIELD_WIDTH_PX / PDF_SCALE, f.width ?? 120);
      const h = Math.max(MIN_FIELD_HEIGHT_PX / PDF_SCALE, f.height ?? 40);
      return {
        ...f,
        xNorm: f.x / pm.wPt,
        yNorm: f.y / pm.hPt,
        widthNorm: w / pm.wPt,
        heightNorm: h / pm.hPt,
      };
    });
    setSignatureFields(next);
    saveFieldsToBackend(next);
  }, [pageDimsTick, documentId, signatureFields, saveFieldsToBackend]);

  const handleFieldDrop = useCallback(
    (coords: FieldCoords & { fieldType: string; pageWidthPt: number; pageHeightPt: number }) => {
      setDragSource(null);
      const pw = coords.pageWidthPt;
      const ph = coords.pageHeightPt;
      const newField: PlacedField = {
        id: uuidv4(),
        type: coords.fieldType as FieldType,
        page: coords.page,
        recipient_id: selectedRecipientId || undefined,
        x: coords.x,
        y: coords.y,
        width: coords.width,
        height: coords.height,
        xNorm: coords.x / pw,
        yNorm: coords.y / ph,
        widthNorm: coords.width / pw,
        heightNorm: coords.height / ph,
      };
      setSignatureFields((prev) => {
        const next = [...prev, newField];
        saveFieldsToBackend(next);
        return next;
      });
    },
    [selectedRecipientId, saveFieldsToBackend]
  );

  const removeField = (id: string) => {
    setSignatureFields((prev) => {
      const next = prev.filter((f) => f.id !== id);
      saveFieldsToBackend(next);
      return next;
    });
  };

  /** Save fields then send for signature (no navigation to send page). */
  const handleSendForSignature = async () => {
    if (!documentId) return;
    setSendForSignatureResult(null);

    if (sequential && recipients.length > 0) {
      const missing = recipients.filter((r) => !(r.email || '').trim());
      if (missing.length > 0) {
        setSendForSignatureResult('Every recipient must have an email when using Sequential flow (Team Lead → Technical → Legal). Add emails in the recipient list.');
        return;
      }
    }

    const fieldCheck = validateSignatureFieldsBeforeSend(
      recipients,
      signatureFields.map((f) => ({ type: f.type, recipient_id: f.recipient_id ?? null }))
    );
    if (fieldCheck) {
      setSendForSignatureResult(fieldCheck);
      return;
    }

    setSaving(true);
    try {
      const fields = fieldsToApiPayload(signatureFields);
      const fieldsRes = await fetch(`${BACKEND_URL}/api/esign/signature-fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: documentId, fields }),
      });
      const fieldsData = await fieldsRes.json();
      if (!fieldsData.success) {
        setSendForSignatureResult('Failed to save fields.');
        return;
      }
      setSaving(false);
      // Save current recipients before send
      const recipientsSaved = await saveRecipientsAndSet(recipients);
      if (!recipientsSaved?.success) {
        setSendForSignatureResult('Could not save recipients. Please try again.');
        return;
      }
      setSending(true);
      try {
        const sendRes = await fetch(`${BACKEND_URL}/api/esign/documents/${documentId}/send-for-signature`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sequential }),
        });
        const sendData = await sendRes.json();
        if (sendData.success) {
          const msg = sendData.message || 'Sent.';
          const dashNote = sendData.emails_sent > 0 ? ' Recipients will receive an email link to view and sign.' : '';
          setSendForSignatureResult(msg + dashNote);
        } else {
          setSendForSignatureResult(sendData.error || 'Failed to send.');
        }
      } catch {
        setSendForSignatureResult('Failed to send.');
      } finally {
        setSending(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSendForApproval = async () => {
    if (!pendingApproval || !documentId) return;
    setSendingApproval(true);
    setApprovalError(null);
    try {
      // Persist current signature fields before creating workflow so approvers/signers see them
      const fieldsPayload = fieldsToApiPayload(signatureFields);
      if (fieldsPayload.length) {
        await fetch(`${BACKEND_URL}/api/esign/signature-fields`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ document_id: documentId, fields: fieldsPayload }),
        });
      }

      const workflowPayload = {
        documentId: pendingApproval.documentId,
        documentType: 'PDF Agreement',
        clientName: pendingApproval.clientName,
        amount: pendingApproval.amount,
        creatorEmail: pendingApproval.creatorEmail,
        creatorName: pendingApproval.creatorName,
        isOverage: pendingApproval.isOverage ?? false,
        esignDocumentId: documentId,
        totalSteps: 4,
        workflowSteps: [
          { step: 1, role: 'Team Approval', email: pendingApproval.teamEmail, status: 'pending' as const, group: pendingApproval.teamId, comments: '', additionalRecipients: pendingApproval.additionalRecipients ?? [] },
          { step: 2, role: 'Technical Team', email: pendingApproval.approvalEmails.role1, status: 'pending' as const },
          { step: 3, role: 'Legal Team', email: pendingApproval.approvalEmails.role2, status: 'pending' as const },
          { step: 4, role: 'Deal Desk', email: pendingApproval.approvalEmails.role4, status: 'pending' as const },
        ],
      };
      const createRes = await fetch(`${BACKEND_URL}/api/approval-workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workflowPayload),
      });
      const createData = await createRes.json();
      if (!createRes.ok || !createData.workflowId) {
        throw new Error(createData.error || 'Failed to create approval workflow');
      }
      const teamRes = await fetch(`${BACKEND_URL}/api/send-team-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamEmail: pendingApproval.teamEmail,
          additionalRecipients: pendingApproval.additionalRecipients ?? [],
          workflowData: {
            documentId: pendingApproval.documentId,
            documentType: 'PDF Agreement',
            clientName: pendingApproval.clientName,
            amount: pendingApproval.amount,
            workflowId: createData.workflowId,
            teamGroup: pendingApproval.teamId,
            creatorEmail: pendingApproval.creatorEmail,
            requestedByName: pendingApproval.creatorName || pendingApproval.creatorEmail,
          },
        }),
      });
      const teamData = teamRes.ok ? await teamRes.json().catch(() => ({})) : {};
      sessionStorage.removeItem(QUOTE_PENDING_APPROVAL_KEY);
      setPendingApproval(null);
      if (teamData?.success) {
        alert('Approval workflow started. Team Approval has been notified.');
      } else {
        alert('Workflow created but team email may have failed. Please check the Approval dashboard.');
      }
      navigate('/approval', { state: { openDashboardTab: true, source: 'quote-approval', documentId: pendingApproval.documentId } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to send for approval';
      setApprovalError(msg);
    } finally {
      setSendingApproval(false);
    }
  };

  const getFieldLabel = (type: FieldType) => FIELD_DEFS.find((d) => d.type === type)?.label ?? type;

  if (loading || !doc) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100/80 py-6 px-4">
      {editingGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setEditingGroup(null)}>
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Edit group</h2>
              <button type="button" onClick={() => setEditingGroup(null)} className="p-1 rounded text-slate-400 hover:text-slate-600">×</button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Group name</label>
                <input
                  type="text"
                  value={editingGroup.name}
                  onChange={(e) => updateEditingGroupName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="e.g. Legal team"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-700">Recipients in group</label>
                  <button type="button" onClick={addRecipientToEditingGroup} className="text-xs font-medium text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1">
                    <UserPlus className="h-3.5 w-3.5" /> Add
                  </button>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {editingGroup.recipients.map((r, index) => (
                    <div key={index} className="flex gap-2 items-start rounded border border-slate-200 p-2 bg-slate-50/80">
                      <div className="flex-1 min-w-0 grid grid-cols-1 gap-1.5">
                        <input type="text" value={r.name} onChange={(e) => updateEditingGroupRecipient(index, 'name', e.target.value)} placeholder="Name" className="w-full rounded border border-slate-300 px-2 py-1 text-xs" />
                        <input type="email" value={r.email} onChange={(e) => updateEditingGroupRecipient(index, 'email', e.target.value)} placeholder="Email" className="w-full rounded border border-slate-300 px-2 py-1 text-xs" />
                        <select value={r.role} onChange={(e) => updateEditingGroupRecipient(index, 'role', e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1 text-xs bg-white">
                          <option value="signer">Signer</option>
                          <option value="reviewer">Reviewer</option>
                        </select>
                      </div>
                      <button type="button" onClick={() => removeRecipientFromEditingGroup(index)} className="p-1 rounded text-slate-400 hover:text-red-600 shrink-0" title="Remove from group">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-4 py-3 border-t border-slate-200 flex justify-end gap-2">
              <button type="button" onClick={() => setEditingGroup(null)} className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50">
                Cancel
              </button>
              <button type="button" onClick={saveEditingGroup} disabled={!editingGroup.name.trim() || editingGroup.recipients.every((r) => !r.email.trim())} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Place Fields</h1>
          <p className="text-slate-600 mt-1 text-sm">Drag signature, name, title, and date fields onto the document.</p>
        </div>

        <div className="flex gap-6 flex-col lg:flex-row">
          {/* Document area first (left / full width on mobile) */}
          <div className="flex-1 flex flex-col min-w-0 order-2 lg:order-1">
            <div
              ref={scrollContainerRef}
              className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-y-auto overflow-x-hidden min-h-[500px] max-h-[76vh]"
              onDragOver={(e) => e.preventDefault()}
            >
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                <div
                  key={pageNum}
                  data-page={pageNum}
                  className="flex flex-col items-center py-6 first:pt-6 last:pb-6"
                >
                  <span className="text-xs font-medium text-slate-400 mb-2">Page {pageNum} of {totalPages}</span>
                  <div
                    className={`rounded-lg overflow-hidden shadow-md ${dragSource ? 'ring-2 ring-indigo-400 ring-offset-2' : ''}`}
                  >
                    <EsignPdfPageView
                      pdfUrl={fileUrl}
                      pageNumber={pageNum}
                      scale={PDF_SCALE}
                      onPdfInfo={pageNum === 1 ? (info) => setTotalPages(info.numPages) : undefined}
                      onPageDimensions={handlePageDimensions}
                      onDrop={handleFieldDrop}
                      className=""
                    >
                      {signatureFields
                        .filter((f) => (f.page || 1) === pageNum)
                        .map((f) => {
                          const isPointBased = f.x != null && f.y != null;
                          const widthPt = f.width ?? 120;
                          const heightPt = f.height ?? 40;
                          const color = getRecipientColor(f.recipient_id, recipients);
                          const minWidthPt = MIN_FIELD_WIDTH_PX / PDF_SCALE;
                          const minHeightPt = MIN_FIELD_HEIGHT_PX / PDF_SCALE;

                          if (isPointBased) {
                            return (
                              <Rnd
                                key={f.id}
                                position={{ x: (f.x ?? 0) * PDF_SCALE, y: (f.y ?? 0) * PDF_SCALE }}
                                size={{ width: Math.max(MIN_FIELD_WIDTH_PX, widthPt * PDF_SCALE), height: Math.max(MIN_FIELD_HEIGHT_PX, heightPt * PDF_SCALE) }}
                                minWidth={MIN_FIELD_WIDTH_PX}
                                minHeight={MIN_FIELD_HEIGHT_PX}
                                onDragStop={(_e, d) => {
                                  const xPt = d.x / PDF_SCALE;
                                  const yPt = d.y / PDF_SCALE;
                                  const pm = pageMetricsRef.current[f.page];
                                  const fw = f.width ?? 120;
                                  const fh = f.height ?? 40;
                                  const next = signatureFields.map((field) =>
                                    field.id === f.id
                                      ? {
                                          ...field,
                                          x: xPt,
                                          y: yPt,
                                          width: fw,
                                          height: fh,
                                          ...(pm
                                            ? {
                                                xNorm: xPt / pm.wPt,
                                                yNorm: yPt / pm.hPt,
                                                widthNorm: fw / pm.wPt,
                                                heightNorm: fh / pm.hPt,
                                              }
                                            : {}),
                                        }
                                      : field
                                  );
                                  setSignatureFields(next);
                                  saveFieldsToBackend(next);
                                }}
                                onResizeStop={(_e, _dir, ref, _delta, position) => {
                                  const xPt = position.x / PDF_SCALE;
                                  const yPt = position.y / PDF_SCALE;
                                  const wPt = Math.max(minWidthPt, ref.offsetWidth / PDF_SCALE);
                                  const hPt = Math.max(minHeightPt, ref.offsetHeight / PDF_SCALE);
                                  const pm = pageMetricsRef.current[f.page];
                                  const next = signatureFields.map((field) =>
                                    field.id === f.id
                                      ? {
                                          ...field,
                                          x: xPt,
                                          y: yPt,
                                          width: wPt,
                                          height: hPt,
                                          ...(pm
                                            ? {
                                                xNorm: xPt / pm.wPt,
                                                yNorm: yPt / pm.hPt,
                                                widthNorm: wPt / pm.wPt,
                                                heightNorm: hPt / pm.hPt,
                                              }
                                            : {}),
                                        }
                                      : field
                                  );
                                  setSignatureFields(next);
                                  saveFieldsToBackend(next);
                                }}
                                enableResizing={{ bottom: true, right: true, bottomRight: true }}
                                dragGrid={[1, 1]}
                                resizeGrid={[1, 1]}
                                className={`flex items-center justify-center rounded font-medium text-sm cursor-move group ${color.box}`}
                                onClick={(e: React.MouseEvent) => {
                                  e.stopPropagation();
                                  if (e.detail === 2) removeField(f.id);
                                }}
                                title={`${getFieldLabel(f.type)}${f.recipient_id ? ` • ${recipients.find((r) => r.id === f.recipient_id)?.name || ''}` : ''} (double-click to remove)`}
                              >
                                {getFieldLabel(f.type)}
                                <span
                                  className="ml-1 text-xs opacity-0 group-hover:opacity-100"
                                  onClick={(e: React.MouseEvent) => { e.stopPropagation(); removeField(f.id); }}
                                >
                                  ×
                                </span>
                              </Rnd>
                            );
                          }

                          return (
                            <div
                              key={f.id}
                              className={`absolute flex items-center justify-center rounded font-medium text-sm cursor-pointer group ${color.box}`}
                              style={{
                                left: `${f.xPct ?? 10}%`,
                                top: `${f.yPct ?? 80}%`,
                                width: `${f.widthPct ?? 20}%`,
                                height: `${f.heightPct ?? 4}%`,
                              }}
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation();
                                if (e.detail === 2) removeField(f.id);
                              }}
                              title={`${getFieldLabel(f.type)}${f.recipient_id ? ` • ${recipients.find((r) => r.id === f.recipient_id)?.name || ''}` : ''} (double-click to remove)`}
                            >
                              {getFieldLabel(f.type)}
                              <span
                                className="ml-1 text-xs opacity-0 group-hover:opacity-100"
                                onClick={(e: React.MouseEvent) => { e.stopPropagation(); removeField(f.id); }}
                              >
                                ×
                              </span>
                            </div>
                          );
                        })}
                    </EsignPdfPageView>
                  </div>
                </div>
              ))}
            </div>

            {approvalError && (
              <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-center justify-between gap-2">
                <span>{approvalError}</span>
                <button type="button" onClick={() => setApprovalError(null)} className="text-red-600 hover:text-red-800 font-medium">×</button>
              </div>
            )}
            {sendForSignatureResult && (
              <div className="mt-4">
                <p className={`text-sm ${sendForSignatureResult.startsWith('Signing') || sendForSignatureResult.startsWith('Document') ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {sendForSignatureResult}
                </p>
              </div>
            )}
            <label className="flex items-center gap-3 mt-4 pt-4 border-t border-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={sequential}
                onChange={(e) => setSequential(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-slate-700">
                Sequential: send only to first recipient; after they sign or review, the next receives the email.
                {recipients.length >= 2 && (
                  <span className="block mt-0.5 text-amber-700 font-medium">
                    Recommended for Team Lead → Technical → Legal flow.
                  </span>
                )}
              </span>
            </label>
            <div className="flex flex-wrap items-center justify-between gap-4 mt-4 pt-4 border-t border-slate-200">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600">Go to page</span>
                <input
                  id="goto-page"
                  type="number"
                  min={1}
                  max={totalPages}
                  defaultValue={1}
                  className="w-14 rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const n = Math.max(1, Math.min(totalPages, parseInt((e.target as HTMLInputElement).value, 10) || 1));
                      scrollContainerRef.current?.querySelector(`[data-page="${n}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const input = document.getElementById('goto-page') as HTMLInputElement;
                    const n = input ? Math.max(1, Math.min(totalPages, parseInt(input.value, 10) || 1)) : 1;
                    scrollContainerRef.current?.querySelector(`[data-page="${n}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Go
                </button>
                <span className="text-sm text-slate-500">1–{totalPages}</span>
              </div>
              <button
                onClick={handleSendForSignature}
                disabled={saving || sending}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 text-white px-5 py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 shadow-md hover:shadow-lg transition-shadow"
              >
                {(saving || sending) ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Mail className="h-4 w-4" /> Send for Signature</>}
              </button>
            </div>
          </div>

          {/* Right panel: recipients & fields */}
          <div className="w-full lg:w-80 shrink-0 order-1 lg:order-2">
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden sticky top-24 max-h-[85vh] overflow-y-auto">
              <div className="p-4 space-y-5">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800 mb-0.5">Recipients ({recipients.length})</h2>
                  <p className="text-xs text-slate-500 mb-3">Add Reviewer or Signer. Signers get fields; Reviewers mark as Reviewed.</p>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {recipients.map((r, index) => {
                  const isSelected = selectedRecipientId === r.id;
                  const recipientColor = getRecipientColor(r.id, recipients);
                  const effectiveAction = r.action ?? (r.role === 'Technical Team' || r.role === 'Legal Team' ? 'reviewer' : (r.role?.toLowerCase() === 'reviewer' ? 'reviewer' : 'signer'));
                  const isReviewer = effectiveAction === 'reviewer';
                  const roleForDropdown = r.role === 'Team Lead' || r.role === 'Technical Team' || r.role === 'Legal Team' ? r.role : '— None —';
                  return (
                    <div
                      key={r.id}
                      className={`rounded-lg overflow-hidden border-2 ${isSelected ? `${recipientColor.box} ring-1 ring-offset-1` : 'border-slate-300 bg-white'}`}
                    >
                      <div className="flex items-start justify-between gap-1 p-2.5">
                        <div className="min-w-0 flex-1 flex items-start gap-2">
                          <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${recipientColor.dot}`} title="Field color" />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-slate-900 text-sm truncate">{r.name || r.email}</p>
                            <p className="text-xs text-slate-500 truncate mt-0.5">{r.email || ''}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              {roleForDropdown !== '— None —' && (
                                <span className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                                  {getRoleDisplayLabel(r.role)}
                                </span>
                              )}
                              <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded ${isReviewer ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'}`}>
                                {effectiveAction === 'reviewer' ? 'Review' : 'Sign'}
                              </span>
                            </div>
                            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                              <span className="text-[9px] text-slate-500">Role:</span>
                              <select
                                value={roleForDropdown}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  updateRecipientRole(r.id, v === '— None —' ? (effectiveAction) : v);
                                }}
                                className="text-[10px] rounded border border-slate-300 bg-white py-0.5 pr-6 pl-1"
                                title="Dashboard label in email (None = generic)"
                              >
                                <option value="— None —">— None —</option>
                                <option value="Team Lead">Team Lead</option>
                                <option value="Technical Team">Technical Team</option>
                                <option value="Legal Team">Legal Team</option>
                              </select>
                              <span className="text-[9px] text-slate-500">Action:</span>
                              <select
                                value={effectiveAction}
                                onChange={(e) => updateRecipientAction(r.id, e.target.value as 'signer' | 'reviewer')}
                                className="text-[10px] rounded border border-slate-300 bg-white py-0.5 pr-6 pl-1"
                                title="Sign or Review"
                              >
                                <option value="signer">Sign</option>
                                <option value="reviewer">Review</option>
                              </select>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0 flex-wrap justify-end">
                          {recipients.length > 1 && (
                            <>
                              <button type="button" onClick={() => moveRecipientUp(index)} disabled={index === 0} className="p-0.5 text-slate-500 hover:text-indigo-600 disabled:opacity-30" title="Move up"><ArrowUp className="h-3.5 w-3.5" /></button>
                              <button type="button" onClick={() => moveRecipientDown(index)} disabled={index === recipients.length - 1} className="p-0.5 text-slate-500 hover:text-indigo-600 disabled:opacity-30" title="Move down"><ArrowDown className="h-3.5 w-3.5" /></button>
                            </>
                          )}
                          <button type="button" onClick={() => removeRecipient(r.id)} className="p-0.5 text-slate-400 hover:text-red-600" title="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 pt-2 border-t border-slate-200">
                <input type="text" value={newRecipient.name} onChange={(e) => { setNewRecipient((p) => ({ ...p, name: e.target.value })); setRecipientError(null); }} placeholder="Name" className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs mb-1.5" />
                <input type="email" value={newRecipient.email} onChange={(e) => { setNewRecipient((p) => ({ ...p, email: e.target.value })); setRecipientError(null); }} placeholder="Email" className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs mb-1.5" />
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs text-slate-600">Role:</span>
                  <select
                    value={newRecipient.role}
                    onChange={(e) => setNewRecipient((p) => ({ ...p, role: e.target.value as 'signer' | 'reviewer' }))}
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                  >
                    <option value="signer">Signer</option>
                    <option value="reviewer">Reviewer</option>
                  </select>
                </div>
                {recipientError && <p className="text-xs text-red-600 mt-1">{recipientError}</p>}
                <button type="button" onClick={addRecipient} disabled={addingRecipient || !newRecipient.email.trim()} className="mt-1.5 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">
                  {addingRecipient ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Add recipient
                </button>
                {recipients.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    <button type="button" onClick={saveCurrentRecipientsToSaved} className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-800">
                      <Bookmark className="h-3.5 w-3.5" /> Save current to list
                    </button>
                    <div className="flex gap-1.5 items-center flex-wrap">
                      <input
                        type="text"
                        value={groupNameInput}
                        onChange={(e) => setGroupNameInput(e.target.value)}
                        placeholder="Group name"
                        className="flex-1 min-w-0 rounded border border-slate-300 px-2 py-1 text-xs"
                      />
                      <button type="button" onClick={saveCurrentAsGroup} disabled={!groupNameInput.trim()} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-50">
                        <Users className="h-3.5 w-3.5" /> Save as group
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {savedGroups.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-200">
                  <p className="text-xs font-medium text-slate-700 mb-1">Saved groups</p>
                  <p className="text-[10px] text-slate-500 mb-1.5">Use &quot;Add to document&quot; to add a group. Default (★) is your preferred group when adding.</p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {savedGroups.map((g) => {
                      const isExpanded = expandedGroupId === g.id;
                      const isDefault = defaultGroupId === g.id;
                      return (
                        <div key={g.id} className={`rounded border overflow-hidden ${isDefault ? 'border-amber-400 bg-amber-50/50' : 'border-slate-200 bg-white'}`}>
                          <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                            <button type="button" onClick={() => setExpandedGroupId(isExpanded ? null : g.id)} className="min-w-0 flex-1 flex items-center gap-1 text-left">
                              <span className="text-slate-400">{isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}</span>
                              <p className="text-xs font-medium text-slate-800 truncate">{g.name}</p>
                              {isDefault && <span className="shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded bg-amber-200 text-amber-900">Default</span>}
                              <p className="text-[10px] text-slate-500 shrink-0">({g.recipients.length})</p>
                            </button>
                            <div className="flex items-center gap-0.5 shrink-0">
                              <button type="button" onClick={() => setDefaultGroup(isDefault ? null : g.id)} className={`p-1 rounded ${isDefault ? 'text-amber-600 hover:bg-amber-100' : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'}`} title={isDefault ? 'Remove as default group' : 'Set as default group (preferred when you add to document)'}>
                                <Star className={`h-3.5 w-3.5 ${isDefault ? 'fill-current' : ''}`} />
                              </button>
                              <button type="button" onClick={() => addGroupToDocument(g)} className="p-1 rounded text-indigo-600 hover:bg-indigo-50 font-medium text-xs" title="Add all to current document">
                                Add to document
                              </button>
                              <button type="button" onClick={() => startEditingGroup(g)} className="p-1 rounded text-slate-500 hover:text-indigo-600 hover:bg-indigo-50" title="Edit group">
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button type="button" onClick={() => removeGroup(g.id)} className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" title="Remove group">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                          {isExpanded && (
                            <div className="border-t border-slate-100 bg-slate-50/70 px-2 py-1.5 space-y-1 max-h-32 overflow-y-auto">
                              {g.recipients.map((r, i) => (
                                <div key={i} className="flex items-center justify-between gap-2 text-[10px]">
                                  <span className="text-slate-700 truncate">{r.name || r.email}</span>
                                  <span className="text-slate-500 truncate shrink-0 max-w-[120px]">{r.email}</span>
                                  <span className={`shrink-0 px-1 py-0.5 rounded text-[9px] font-medium ${r.role === 'reviewer' ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'}`}>{r.role}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {savedRecipients.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-200">
                  <p className="text-xs font-medium text-slate-700 mb-1.5">Saved recipients</p>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {savedRecipients.map((s) => {
                      const alreadyAdded = recipients.some((r) => r.email.toLowerCase() === s.email.toLowerCase());
                      return (
                        <div key={s.id} className="flex items-center justify-between gap-1 rounded border border-slate-200 bg-white px-2 py-1.5">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-slate-800 truncate">{s.name || s.email}</p>
                            <p className="text-[10px] text-slate-500 truncate">{s.email}</p>
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button type="button" onClick={() => addFromSaved(s)} disabled={alreadyAdded} className="p-1 rounded text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed" title={alreadyAdded ? 'Already added' : 'Add to document'}>
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" onClick={() => removeSavedRecipient(s.id)} className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" title="Remove from saved">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <p className="text-xs text-slate-500 mt-3">Place fields for:</p>
              <select value={selectedRecipientId || ''} onChange={(e) => setSelectedRecipientId(e.target.value || null)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
                <option value="">— None —</option>
                {recipients.map((r) => (<option key={r.id} value={r.id}>{r.name || r.email} ({getRoleDisplayLabel(r.role)})</option>))}
              </select>
              {selectedRecipientId && recipients.find((r) => r.id === selectedRecipientId)?.role?.toLowerCase() === 'reviewer' && (
                <p className="text-xs text-amber-700 mt-1">Reviewers don&apos;t need fields; they will mark as Reviewed from their link.</p>
              )}
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-2">Drag onto the document to place</p>
              <div className="space-y-2">
                {FIELD_DEFS.map(({ type, label, Icon }) => (
                  <div
                    key={type}
                    draggable
                    onDragStart={(e) => {
                      setDragSource(type);
                      e.dataTransfer.setData('text/plain', type);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onDragEnd={() => setDragSource(null)}
                    className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 cursor-grab active:cursor-grabbing transition-colors ${
                      dragSource === type
                        ? 'border-indigo-400 bg-indigo-50'
                        : 'border-slate-300 bg-white hover:border-indigo-300 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="h-5 w-5 text-indigo-600 shrink-0" />
                    <span className="font-medium text-slate-800 text-sm">{label}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-3">
                Scroll to the page you want, then drag fields onto the document.
              </p>
            </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EsignPlaceFieldsPage;
