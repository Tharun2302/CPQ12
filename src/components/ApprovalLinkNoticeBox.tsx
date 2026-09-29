import React from 'react';
import { AlertCircle, CheckCircle, X } from 'lucide-react';
import type { ApprovalLinkNotice } from '../utils/approvalLinkNotice';

interface ApprovalLinkNoticeBoxProps extends ApprovalLinkNotice {
  onDismiss?: () => void;
}

const ApprovalLinkNoticeBox: React.FC<ApprovalLinkNoticeBoxProps> = ({ tone, message, onDismiss }) => {
  const Icon = tone === 'approved' ? CheckCircle : AlertCircle;
  const toneClasses = tone === 'approved'
    ? 'bg-green-50 border-green-200 text-green-800'
    : 'bg-red-50 border-red-200 text-red-800';

  return (
    <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium ${toneClasses}`}>
      <Icon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notice"
          className="p-1 rounded hover:bg-black/5 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
};

export default ApprovalLinkNoticeBox;
