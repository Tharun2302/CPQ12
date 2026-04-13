import React, { useState, useEffect, useRef } from 'react';
import { X, Send, CheckCircle, Loader2, HelpCircle } from 'lucide-react';
import { BACKEND_URL } from '../config/api';

interface ContactUsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userName?: string;
  userEmail?: string;
}

const SUBJECT_OPTIONS = [
  'Issue with Quote',
  'Issue with Approval',
  'Issue with e-Sign',
  'Issue with Templates',
  'Issue with Documents',
  'Account / Login Issue',
  'Feature Request',
  'Other',
];

const ContactUsModal: React.FC<ContactUsModalProps> = ({
  isOpen,
  onClose,
  userName = '',
  userEmail = '',
}) => {
  const [name, setName] = useState(userName);
  const [email, setEmail] = useState(userEmail);
  const [subject, setSubject] = useState(SUBJECT_OPTIONS[0]);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  // Sync pre-filled values when user changes
  useEffect(() => {
    setName(userName);
    setEmail(userEmail);
  }, [userName, userEmail]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setMessage('');
      setSubject(SUBJECT_OPTIONS[0]);
      setError(null);
      setSubmitted(false);
      setTimeout(() => messageRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      setError('Please describe your issue.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const htmlBody = `
      <div style="font-family:sans-serif;font-size:14px;color:#333;max-width:600px">
        <h2 style="color:#1d4ed8;margin-bottom:4px">Support Request — Zenop.ai CPQ</h2>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin-bottom:16px"/>
        <table style="border-collapse:collapse;width:100%">
          <tr><td style="padding:6px 0;font-weight:600;width:90px">Name</td><td style="padding:6px 0">${name || '—'}</td></tr>
          <tr><td style="padding:6px 0;font-weight:600">Email</td><td style="padding:6px 0">${email || '—'}</td></tr>
          <tr><td style="padding:6px 0;font-weight:600">Subject</td><td style="padding:6px 0">${subject}</td></tr>
        </table>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:12px 0"/>
        <p style="font-weight:600;margin-bottom:6px">Message</p>
        <p style="white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px;margin:0">${message}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin-top:20px"/>
        <p style="font-size:12px;color:#9ca3af">Sent via Zenop.ai CPQ Help form</p>
      </div>
    `;

    try {
      const res = await fetch(`${BACKEND_URL}/api/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: 'dealdesk@zenop.ai',
          subject: `[CPQ Support] ${subject} — ${name || email || 'Unknown User'}`,
          message: htmlBody,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to send message');
      }
      setSubmitted(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to send. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <HelpCircle className="w-4.5 h-4.5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Contact Support</h2>
              <p className="text-xs text-slate-500">We'll get back to you as soon as possible</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Close"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Body */}
        {submitted ? (
          /* Success state */
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center gap-3">
            <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mb-1">
              <CheckCircle className="w-7 h-7 text-emerald-500" />
            </div>
            <h3 className="text-base font-semibold text-slate-900">Message Sent!</h3>
            <p className="text-sm text-slate-500">
              Your message has been sent to our support team at{' '}
              <span className="font-medium text-slate-700">dealdesk@zenop.ai</span>.
              We'll follow up with you shortly.
            </p>
            <button
              onClick={onClose}
              className="mt-3 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          /* Form */
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-4">
            {/* Name + Email row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                />
              </div>
            </div>

            {/* Subject */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">Subject</label>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              >
                {SUBJECT_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            {/* Message */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">
                Message <span className="text-red-400">*</span>
              </label>
              <textarea
                ref={messageRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe your issue in detail..."
                rows={4}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              />
            </div>

            {/* Error */}
            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-1">
              <p className="text-[11px] text-slate-400">Sends to dealdesk@zenop.ai</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold transition-colors ${
                    submitting ? 'opacity-70 cursor-not-allowed' : 'hover:bg-blue-700'
                  }`}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      Send Message
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ContactUsModal;
