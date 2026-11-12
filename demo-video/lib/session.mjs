// Browser-side safety net and session setup shared by the explorer, dry runs and the recorder.
import { pathToFileURL } from 'node:url';
import jwt from 'jsonwebtoken';
import { APP_URL, BACKEND_URL, DEMO_JWT_SECRET, FORBIDDEN_PORTS, PEOPLE } from './demo-env.mjs';

// Minimal session token (no Microsoft claims, so Technical approval sign-in stays off in the demo); ids come from setup-demo.mjs.
export async function apiLogin(email) {
  const key = Object.keys(PEOPLE).find((k) => PEOPLE[k].email === email);
  if (!key) throw new Error(`Not a demo user: ${email}`);
  const token = jwt.sign({ userId: `user_demo_${key}`, email }, DEMO_JWT_SECRET, { algorithm: 'HS256', expiresIn: '1d' });
  const res = await fetch(`${BACKEND_URL}/api/auth/me`, { headers: { authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!data.success) throw new Error(`Demo login failed for ${email}: ${data.message || res.status}`);
  return { token, user: data.user };
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

// node lib/session.mjs <name>  prints a snippet to paste into the demo app's browser console.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const who = process.argv[2] || 'priya';
  const logins = ['priya', 'jordan', 'marcus', 'aisha', 'daniel'];
  if (!logins.includes(who)) throw new Error(`Unknown demo user "${who}". Use one of: ${logins.join(', ')}`);
  const { token, user } = await apiLogin(PEOPLE[who].email);
  process.stdout.write(`localStorage.cpq_token=${JSON.stringify(token)};localStorage.cpq_user=${JSON.stringify(JSON.stringify(user))};location='/deal'
`);
}
