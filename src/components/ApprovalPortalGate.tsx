import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ShieldX, Loader2 } from 'lucide-react';
import { BACKEND_URL } from '../config/api';
import TeamApprovalDashboard from './TeamApprovalDashboard';
import TechnicalTeamApprovalDashboard from './TechnicalTeamApprovalDashboard';
import LegalTeamApprovalDashboard from './LegalTeamApprovalDashboard';

/**
 * Gate for role-based approval portals. Validates token from email link
 * and renders the correct portal (Team Lead / Technical / Legal) with no main app nav.
 * Invalid or expired token shows Access Denied.
 */
const ApprovalPortalGate: React.FC = () => {
  const { workflowId } = useParams<{ workflowId: string }>();
  const [searchParams] = useSearchParams();
  const role = searchParams.get('role') || '';
  const token = searchParams.get('token') || '';

  const [status, setStatus] = useState<'loading' | 'denied' | 'allowed'>('loading');
  const [allowedRole, setAllowedRole] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState<string>('');

  useEffect(() => {
    if (!workflowId || !role || !token) {
      setDenyReason(!workflowId || !role ? 'Missing link parameters.' : 'Missing security token.');
      setStatus('denied');
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({ workflowId, role, token });
    const verifyUrl = `${BACKEND_URL}/api/approval-workflows/verify-access?${params}`;

    fetch(verifyUrl, { signal: controller.signal })
      .then((res) => {
        if (res.status === 403) {
          return res.json().then((data) => {
            setDenyReason((data?.message || data?.error) || 'Link invalid or expired.');
            setStatus('denied');
          }).catch(() => {
            setDenyReason('Link invalid or expired.');
            setStatus('denied');
          });
          return;
        }
        if (!res.ok) {
          setDenyReason(`Verification failed (${res.status}). Try again or use the link from your email.`);
          setStatus('denied');
          return;
        }
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        if (data.success && data.role) {
          setAllowedRole(data.role);
          setStatus('allowed');
        } else {
          setDenyReason(data?.message || data?.error || 'Access denied.');
          setStatus('denied');
        }
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        console.error('ApprovalPortalGate verify-access error:', err);
        setDenyReason('Could not verify link. Check your connection and that the app backend is running.');
        setStatus('denied');
      });

    return () => controller.abort();
  }, [workflowId, role, token]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Verifying access...</p>
        </div>
      </div>
    );
  }

  if (status === 'denied') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg border border-gray-200 p-8 text-center">
          <ShieldX className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-600 mb-2">
            {denyReason || 'This link is invalid or has expired.'}
          </p>
          <p className="text-sm text-gray-500">
            Use the link from your approval email, or contact your administrator. Ensure the backend is running and VITE_BACKEND_URL points to it.
          </p>
        </div>
      </div>
    );
  }

  // Render the role-specific portal (no Navigation sidebar)
  if (allowedRole === 'teamlead') {
    return <TeamApprovalDashboard initialWorkflowId={workflowId || undefined} />;
  }
  if (allowedRole === 'technical') {
    return <TechnicalTeamApprovalDashboard initialWorkflowId={workflowId || undefined} />;
  }
  if (allowedRole === 'legal') {
    return <LegalTeamApprovalDashboard initialWorkflowId={workflowId || undefined} />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg border border-gray-200 p-8 text-center">
        <ShieldX className="w-16 h-16 text-red-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
        <p className="text-gray-600">Invalid role. Please use the link from your approval email.</p>
      </div>
    </div>
  );
};

export default ApprovalPortalGate;
