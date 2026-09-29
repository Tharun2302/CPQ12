import React from 'react';
import { Database, Mail, MessageSquare, Users } from 'lucide-react';
import { ManageSprawlConfig, SprawlType } from '../types/pricing';
import { sprawlGroupLabel } from '../utils/pricing';

interface SprawlGroupCardProps {
  group: ManageSprawlConfig;
  index: number;
  onChange: (exhibitId: string, patch: Partial<Pick<ManageSprawlConfig, 'users' | 'quantity'>>) => void;
}

const QUANTITY: Record<SprawlType, { label: string; grad: string; placeholder: string; Icon: typeof Database }> = {
  Content: { label: 'Content data size in GB', grad: 'from-emerald-500 to-emerald-600', placeholder: 'Enter data size in GB', Icon: Database },
  Message: { label: 'Messages Count', grad: 'from-teal-500 to-teal-600', placeholder: 'Enter messages count', Icon: MessageSquare },
  Email: { label: 'Emails Count', grad: 'from-amber-500 to-amber-600', placeholder: 'Enter emails count', Icon: Mail },
};

const INPUT_CLASS = 'w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white/80 backdrop-blur-sm hover:border-blue-300 text-lg font-medium';

const parseCount = (v: string): number => (v === '' ? 0 : (parseInt(v, 10) || 0));

interface CountFieldProps {
  id: string;
  label: string;
  grad: string;
  icon: React.ReactNode;
  value: number;
  placeholder: string;
  onValue: (value: number) => void;
}

function CountField({ id, label, grad, icon, value, placeholder, onValue }: CountFieldProps) {
  return (
    <div className="group">
      <label htmlFor={id} className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
        <div className={`w-8 h-8 bg-gradient-to-br ${grad} rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200`}>
          {icon}
        </div>
        {label}
      </label>
      <input
        id={id}
        type="number"
        min="0"
        step="1"
        value={value || ''}
        onChange={(e) => onValue(parseCount(e.target.value))}
        className={INPUT_CLASS}
        placeholder={placeholder}
        autoComplete="off"
      />
    </div>
  );
}

function SprawlGroupCard({ group, index, onChange }: SprawlGroupCardProps) {
  const title = sprawlGroupLabel(group.type, group.exhibitName);
  const q = QUANTITY[group.type];
  return (
    <section
      data-testid="sprawl-group"
      aria-label={title}
      className="rounded-xl border-2 border-gray-200 bg-white/60 px-4 sm:px-6 py-6 mb-6"
    >
      <h4 className="text-base font-bold text-gray-900">{title}</h4>
      <p className="text-sm text-gray-600 mb-5">{group.exhibitName}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <CountField
          id={`sprawl-group-${index}-users`}
          label="Number of Users"
          grad="from-blue-500 to-blue-600"
          icon={<Users className="w-4 h-4 text-white" />}
          value={group.users}
          placeholder="Enter number of users"
          onValue={(users) => onChange(group.exhibitId, { users })}
        />
        <CountField
          id={`sprawl-group-${index}-quantity`}
          label={q.label}
          grad={q.grad}
          icon={<q.Icon className="w-4 h-4 text-white" />}
          value={group.quantity}
          placeholder={q.placeholder}
          onValue={(quantity) => onChange(group.exhibitId, { quantity })}
        />
      </div>
    </section>
  );
}

export default SprawlGroupCard;
