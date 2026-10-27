import type { DiyWorkload } from '../types/pricing';
import { DIY_WORKLOADS } from './pricing';

export type ExhibitFamily = 'messaging' | 'content' | 'email';

const WORKLOAD_BY_FAMILY: Record<ExhibitFamily, DiyWorkload> = {
  content: 'Content',
  email: 'Mailbox',
  messaging: 'Messages'
};

export const diyWorkloadsForFamilies = (families: Iterable<ExhibitFamily>): DiyWorkload[] => {
  const wanted = new Set(Array.from(families, f => WORKLOAD_BY_FAMILY[f]));
  return DIY_WORKLOADS.filter(w => wanted.has(w));
};

// Ticking an exhibit ticks its workload; unticking the last exhibit of a family unticks it.
// Workloads the user ticked by hand, with no exhibit behind them, are left alone.
export function syncDiyWorkloads(
  current: DiyWorkload[],
  before: DiyWorkload[],
  after: DiyWorkload[]
): DiyWorkload[] {
  const next = new Set(current);
  before.filter(w => !after.includes(w)).forEach(w => next.delete(w));
  after.forEach(w => next.add(w));
  return DIY_WORKLOADS.filter(w => next.has(w));
}
