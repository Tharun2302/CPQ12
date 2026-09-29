import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { BACKEND_URL } from '../config/api';
import { ConfigurationData, ManageSprawlConfig } from '../types/pricing';
import { manageAgreementCard, normalizeSprawlConfigs, withSprawlConfigs } from '../utils/pricing';
import { applySprawlGroups, buildSprawlGroups } from '../utils/sprawlGroups';
import { persistConfig } from '../utils/sessionConfig';

type SprawlPatch = Partial<Pick<ManageSprawlConfig, 'users' | 'quantity'>>;

// Keeps a Manage sprawl agreement's per-exhibit groups in step with the selected exhibits.
export function useSprawlGroups(
  config: ConfigurationData,
  setConfig: Dispatch<SetStateAction<ConfigurationData>>,
  selectedExhibits: string[]
) {
  const memoryRef = useRef<Map<string, ManageSprawlConfig>>(new Map());
  const memoryKeyRef = useRef('');
  const active = config.servicePlan === 'Manage' && manageAgreementCard(config) !== 'both';

  const clearSprawlMemory = useCallback(() => {
    memoryRef.current.clear();
    memoryKeyRef.current = '';
  }, []);

  useEffect(() => {
    if (!active) {
      clearSprawlMemory();
      return;
    }
    const agreementKey = `${config.migrationType}|${config.manageAgreementLabel || ''}`;
    if (memoryKeyRef.current !== agreementKey) {
      memoryRef.current.clear();
      memoryKeyRef.current = agreementKey;
    }
    let cancelled = false;
    const apply = (exhibits: any[]) => {
      const groups = buildSprawlGroups(exhibits, selectedExhibits);
      setConfig(prev => {
        const next = applySprawlGroups(prev, groups, memoryRef.current);
        if (next !== prev) persistConfig(next);
        return next;
      });
    };
    if ((selectedExhibits || []).filter(Boolean).length === 0) {
      apply([]);
      return;
    }
    fetch(`${BACKEND_URL}/api/exhibits`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!cancelled && data?.success && Array.isArray(data.exhibits)) apply(data.exhibits);
      })
      .catch(error => {
        if (import.meta.env?.DEV) console.error('Error fetching exhibits for Data Sprawl groups:', error);
      });
    return () => { cancelled = true; };
  }, [active, config.migrationType, config.manageAgreementLabel, selectedExhibits, setConfig, clearSprawlMemory]);

  // Functional update so two quick edits cannot overwrite each other from a stale render.
  const updateSprawlConfig = useCallback((exhibitId: string, patch: SprawlPatch) => {
    setConfig(prev => {
      const groups = normalizeSprawlConfigs(prev).map(c => (c.exhibitId === exhibitId ? { ...c, ...patch } : c));
      const next = withSprawlConfigs(prev, groups);
      persistConfig(next);
      return next;
    });
  }, [setConfig]);

  return { clearSprawlMemory, updateSprawlConfig };
}
