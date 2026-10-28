// Browser-side safety net and API login shared by the explorer, dry runs and the recorder.
import { APP_URL, BACKEND_URL, DEMO_PASSWORD, FORBIDDEN_PORTS } from './demo-env.mjs';

export async function apiLogin(email) {
  const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: DEMO_PASSWORD }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(`Demo login failed for ${email}: ${data.error || res.status}`);
  return data;
}

// Any request to the developer's live servers (which use production) is rerouted to the demo backend.
export async function guardContext(context, onReroute = () => {}) {
  for (const port of FORBIDDEN_PORTS) {
    await context.route(new RegExp(`^https?://(localhost|127\\.0\\.0\\.1):${port}/`), async (route) => {
      const original = route.request().url();
      const target = original.replace(/^https?:\/\/(localhost|127\.0\.0\.1):\d+/, port === 5173 ? APP_URL : BACKEND_URL);
      onReroute(original, target);
      await route.continue({ url: target });
    });
  }
  // Third-party analytics and fonts never matter for the demo; block anything off-machine.
  await context.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.abort());
}

export function sessionInitScript({ token, user }) {
  return `(() => {
    try {
      if (!sessionStorage.getItem('__demoSeeded:' + ${JSON.stringify(user.email)})) {
        localStorage.setItem('cpq_token', ${JSON.stringify(token)});
        localStorage.setItem('cpq_user', ${JSON.stringify(JSON.stringify(user))});
        sessionStorage.setItem('__demoSeeded:' + ${JSON.stringify(user.email)}, '1');
      }
    } catch (e) {}
  })();`;
}

export function dealUrl(deal, pathName = '/deal') {
  const p = new URLSearchParams({
    dealId: deal.dealId,
    dealName: deal.dealName,
    amount: deal.amount,
    stage: deal.stage,
    closeDate: new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10),
    ContactEmail: deal.contactEmail,
    ContactFirstName: deal.contactFirst,
    ContactLastName: deal.contactLast,
    CompanyName: deal.company,
  });
  return `${APP_URL}${pathName}?${p}`;
}
