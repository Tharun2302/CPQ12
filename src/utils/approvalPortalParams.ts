export interface ApprovalPortalParams {
  workflowId: string;
  role: string;
  token: string;
}

type LocationLike = Pick<Location, 'pathname' | 'search'>;

// The emailed link is /approval/<workflowId>?role=..&token=.., so the id lives in the path, not the query
const PORTAL_PATH = /^\/approval\/([^/]+)\/?$/;

/** Proof of access carried by an approval-portal link, or null when the page was not opened from one. */
export function getApprovalPortalParams(
  loc: LocationLike | undefined = typeof window !== 'undefined' ? window.location : undefined
): ApprovalPortalParams | null {
  if (!loc) return null;
  const query = new URLSearchParams(loc.search);
  const role = query.get('role') || '';
  const token = query.get('token') || '';

  // The client page link is /client-notification?workflow=<id>&role=client&token=..
  let workflowId = query.get('workflowId') || query.get('workflow') || '';
  if (!workflowId) {
    const match = PORTAL_PATH.exec(loc.pathname);
    if (match) {
      try {
        workflowId = decodeURIComponent(match[1]);
      } catch {
        workflowId = match[1];
      }
    }
  }

  return workflowId && role && token ? { workflowId, role, token } : null;
}

/** Query string (with leading "?") that proves portal access to the workflow list, or "" when not on a portal link. */
export function getApprovalPortalQuery(loc?: LocationLike): string {
  const params = getApprovalPortalParams(loc);
  return params ? `?${new URLSearchParams({ ...params })}` : '';
}

/** Adds the link's proof of access to a URL that may already have a query string; unchanged when not on a link. */
export function withApprovalPortalQuery(url: string, loc?: LocationLike): string {
  const query = getApprovalPortalQuery(loc);
  if (!query) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${query.slice(1)}`;
}
