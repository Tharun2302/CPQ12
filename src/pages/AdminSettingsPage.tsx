import { ShieldAlert } from 'lucide-react';

import Navigation from '../components/Navigation';
import AdminEmailListSettings from '../components/admin/AdminEmailListSettings';
import DiscountPolicySettings from '../components/admin/DiscountPolicySettings';
import { useAuth } from '../hooks/useAuth';

function AdminSettingsPage() {
  const { user, loading } = useAuth();
  const isApprovalAdmin = Boolean(user?.isApprovalAdmin);

  const renderContent = () => {
    // Until the user is known, "Access denied" would flash for real admins
    if (loading) {
      return (
        <p role="status" aria-live="polite" className="text-sm text-gray-600">
          Loading settings…
        </p>
      );
    }
    if (isApprovalAdmin) {
      return (
        <div className="space-y-6">
          <DiscountPolicySettings />
          <AdminEmailListSettings
            kind="redline-admins"
            title="Redline Admins"
            description="Can use Edit for RedLine on any agreement, and add, edit, delete and redline exhibits. Managing Exhibit admins stays with Exhibit admins."
            helperText="To find agreements created by others on the Documents page, also add the person as a Document admin."
          />
          <AdminEmailListSettings
            kind="document-admins"
            title="Document Admins"
            description="Can see every document on the Documents page; others see only their own."
          />
        </div>
      );
    }
    return (
      <div
        role="alert"
        className="flex max-w-2xl items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800 sm:p-6"
      >
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">Access denied</p>
          <p className="text-sm">Only approval admins can change admin settings.</p>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-50 via-blue-50/50 to-indigo-100/50">
      <Navigation currentTab="admin-settings" />
      <main className="box-border w-full min-w-0 px-4 py-6 lg:ml-64 lg:w-[calc(100%-16rem)] lg:px-8">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Admin Settings</h1>
        {renderContent()}
      </main>
    </div>
  );
}

export default AdminSettingsPage;
