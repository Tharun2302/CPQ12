import { scopeExhibitsForCombination } from './exhibitCombination';

type IncludeType = 'included' | 'notincluded';

export type ManageExhibitLike = {
  _id?: unknown;
  name?: string;
  category?: string;
  combinations?: string[];
  includeType?: string;
  displayOrder?: number;
};

// grouped = today's Include / Not Include headings; plain = each file as-is, no headings
export type ManageMergeMode = 'grouped' | 'plain';

export interface ManageMergePlan<T> {
  exhibits: T[];
  mode: ManageMergeMode;
}

export interface ManageMergeResult {
  blob: Blob;
  attached: number;
  failed: string[];
}

const idOf = (ex: ManageExhibitLike): string => String(ex?._id ?? '').trim();

const includeTypeOf = (ex: ManageExhibitLike): IncludeType | undefined =>
  ex?.includeType === 'included' || ex?.includeType === 'notincluded' ? ex.includeType : undefined;

const includeRank = (ex: ManageExhibitLike): number => {
  const it = includeTypeOf(ex);
  if (it === 'included') return 0;
  return it === 'notincluded' ? 2 : 1;
};

// Manage has one flat price, so plan type is ignored; ids only, since Manage files may share a name
export function planManageExhibitMerge<T extends ManageExhibitLike>(
  allExhibits: T[],
  templateValue: string,
  selectedIds: string[],
): ManageMergePlan<T> {
  const slug = String(templateValue || '').trim();
  const ticked = new Set((selectedIds || []).map((id) => String(id ?? '').trim()).filter(Boolean));
  if (!slug || ticked.size === 0) return { exhibits: [], mode: 'plain' };

  const seen = new Set<string>();
  const exhibits = scopeExhibitsForCombination(allExhibits, { combination: slug, restrict: true })
    .filter((ex) => {
      const id = idOf(ex);
      if (!id || !ticked.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    // Include, untyped, Not Include; the picker's displayOrder within each
    .sort((a, b) => (
      includeRank(a) - includeRank(b)
      || (a.displayOrder ?? 0) - (b.displayOrder ?? 0)
      || String(a.name || '').localeCompare(String(b.name || ''))
    ));

  // Grouped mode guesses untyped files from their name and deletes their "not included" text
  const mode: ManageMergeMode = exhibits.length > 0 && exhibits.every((ex) => includeTypeOf(ex))
    ? 'grouped'
    : 'plain';
  return { exhibits, mode };
}

async function isDocxZip(blob: Blob): Promise<boolean> {
  if (blob.size < 4) return false;
  const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
}

// Files that fail to load are reported in `failed` so the caller can tell the user
export async function mergeManageExhibits(
  agreement: Blob,
  opts: { backendUrl: string; templateValue: string; selectedIds: string[] },
): Promise<ManageMergeResult> {
  const listRes = await fetch(`${opts.backendUrl}/api/exhibits?t=${Date.now()}`, { cache: 'no-store' });
  if (!listRes.ok) throw new Error(`Could not load the exhibit list (status ${listRes.status}).`);
  const listData = await listRes.json();
  const all: ManageExhibitLike[] = listData?.success && Array.isArray(listData.exhibits) ? listData.exhibits : [];

  const { exhibits, mode } = planManageExhibitMerge(all, opts.templateValue, opts.selectedIds);
  if (exhibits.length === 0) return { blob: agreement, attached: 0, failed: [] };

  const blobs: Blob[] = [];
  const metadata: Array<{ name: string; category?: string; includeType?: IncludeType }> = [];
  const failed: string[] = [];
  for (const ex of exhibits) {
    const label = String(ex.name || idOf(ex));
    try {
      const res = await fetch(`${opts.backendUrl}/api/exhibits/${idOf(ex)}/file?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) {
        failed.push(label);
        continue;
      }
      const blob = await res.blob();
      // The merger skips an unreadable file without telling anyone, so reject non-DOCX bytes here
      if (!(await isDocxZip(blob))) {
        failed.push(label);
        continue;
      }
      blobs.push(blob);
      metadata.push({ name: String(ex.name || ''), category: ex.category || '', includeType: includeTypeOf(ex) });
    } catch {
      failed.push(label);
    }
  }

  if (blobs.length === 0) return { blob: agreement, attached: 0, failed };

  const { mergeDocxFiles } = await import('./docxMerger');
  const blob = mode === 'grouped'
    ? await mergeDocxFiles(agreement, blobs, metadata)
    : await mergeDocxFiles(agreement, blobs, undefined, { keepAllContent: true });
  return { blob, attached: blobs.length, failed };
}
