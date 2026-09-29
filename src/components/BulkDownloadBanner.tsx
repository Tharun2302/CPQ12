import { AlertCircle, AlertTriangle, CheckCircle, X } from 'lucide-react';
import type { BulkResultMessage } from '../utils/bulkZipDownload';

type BannerStyle = { box: string; icon: string; text: string; Icon: typeof CheckCircle };

const BULK_MESSAGE_STYLES: Record<BulkResultMessage['kind'], BannerStyle> = {
  success: {
    box: 'bg-green-50 border-green-200',
    icon: 'text-green-600',
    text: 'text-green-800',
    Icon: CheckCircle,
  },
  warning: {
    box: 'bg-amber-50 border-amber-200',
    icon: 'text-amber-600',
    text: 'text-amber-800',
    Icon: AlertTriangle,
  },
  error: {
    box: 'bg-red-50 border-red-200',
    icon: 'text-red-600',
    text: 'text-red-800',
    Icon: AlertCircle,
  },
};

type BulkDownloadBannerProps = {
  message: BulkResultMessage;
  onDismiss: () => void;
};

function BulkDownloadBanner({ message, onDismiss }: BulkDownloadBannerProps) {
  const { box, icon, text, Icon } = BULK_MESSAGE_STYLES[message.kind];
  return (
    <div
      role={message.kind === 'error' ? 'alert' : 'status'}
      className={`mb-4 p-4 border rounded-lg flex items-center gap-2 ${box}`}
    >
      <Icon className={`w-5 h-5 flex-shrink-0 ${icon}`} aria-hidden="true" />
      <span className={`flex-1 ${text}`}>{message.text}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss download message"
        className={`p-1 rounded hover:bg-white/60 transition-colors ${text}`}
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export default BulkDownloadBanner;
