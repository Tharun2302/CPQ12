// Injected with addInitScript into every page the recorder opens. Mounted after page load; state that must
// survive navigation (cursor position, badge) lives in sessionStorage. Everything is pointer-events: none.
(() => {
  if (window.__demo) return;
  const KEY = '__demoOverlay';
  const read = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || '{}'); } catch { return {}; } };
  const write = (patch) => { try { sessionStorage.setItem(KEY, JSON.stringify({ ...read(), ...patch })); } catch {} };
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let speed = read().speed || 1;
  let root;
  let cursor;
  let badge;
  let pos = read().cursor || { x: 800, y: 450 };

  const css = `
    #__demo-root, #__demo-root * { pointer-events: none !important; box-sizing: border-box; }
    #__demo-root { position: fixed; inset: 0; z-index: 2147483647; font-family: 'Segoe UI', Inter, system-ui, sans-serif; }
    #__demo-cursor { position: fixed; left: 0; top: 0; width: 26px; height: 26px; transform: translate(-3px,-2px); filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); transition: opacity .3s; }
    .__demo-ripple { position: fixed; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; border: 3px solid rgba(59,130,246,.9); background: rgba(59,130,246,.25); animation: __demoRipple .65s ease-out forwards; }
    @keyframes __demoRipple { to { transform: scale(4.2); opacity: 0; } }
    .__demo-ring { position: fixed; border: 3px solid #f59e0b; border-radius: 12px; box-shadow: 0 0 0 6px rgba(245,158,11,.22), 0 0 24px rgba(245,158,11,.35); animation: __demoRingIn .35s ease-out, __demoPulse 1.6s ease-in-out .35s infinite; transition: opacity .35s; }
    @keyframes __demoRingIn { from { transform: scale(1.12); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    @keyframes __demoPulse { 50% { box-shadow: 0 0 0 11px rgba(245,158,11,.12), 0 0 30px rgba(245,158,11,.45); } }
    #__demo-badge { position: fixed; right: 12px; top: 10px; padding: 6px 12px 6px 8px; border-radius: 999px; background: rgba(15,23,42,.86); color: #f8fafc; font-size: 13px; display: flex; gap: 8px; align-items: center; box-shadow: 0 6px 18px rgba(15,23,42,.25); transition: opacity .3s; }
    #__demo-badge .dot { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font-weight: 700; font-size: 12px; color: white; }
    #__demo-badge b { font-weight: 600; }
    #__demo-badge span.role { color: #cbd5e1; }
    #__demo-card { position: fixed; inset: 0; display: grid; place-items: center; background: radial-gradient(ellipse at 30% 20%, #1e3a8a 0%, #0f172a 70%); color: white; opacity: 0; transition: opacity .45s ease; }
    #__demo-card .inner { text-align: center; transform: translateY(8px); transition: transform .6s ease; }
    #__demo-card.show { opacity: 1; } #__demo-card.show .inner { transform: none; }
    #__demo-card .kicker { font-size: 18px; letter-spacing: .22em; text-transform: uppercase; color: #93c5fd; margin-bottom: 18px; }
    #__demo-card .title { font-size: 56px; font-weight: 700; letter-spacing: -.01em; }
    #__demo-card .bar { width: 72px; height: 4px; background: #60a5fa; border-radius: 4px; margin: 26px auto 0; }
    #__demo-alert { position: fixed; left: 50%; top: 22px; transform: translate(-50%, -16px); min-width: 460px; max-width: 760px; padding: 16px 20px; border-radius: 14px; background: white; color: #0f172a; box-shadow: 0 18px 50px rgba(15,23,42,.35); border: 1px solid #e2e8f0; opacity: 0; transition: all .35s ease; font-size: 16px; line-height: 1.45; white-space: pre-line; }
    #__demo-alert.show { opacity: 1; transform: translate(-50%, 0); }
    #__demo-alert .head { font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #64748b; margin-bottom: 6px; }
    #__demo-alert.warn { border-left: 6px solid #dc2626; } #__demo-alert.ok { border-left: 6px solid #16a34a; }
  `;

  const ARROW = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2.5 L4 19.5 L8.6 15.3 L11.6 22 L14.6 20.7 L11.7 14.2 L18 14.2 Z" fill="#111827" stroke="white" stroke-width="1.6" stroke-linejoin="round"/></svg>';

  function mount() {
    if (root && document.documentElement.contains(root)) return;
    const style = document.createElement('style');
    style.textContent = css;
    root = document.createElement('div');
    root.id = '__demo-root';
    root.appendChild(style);
    cursor = document.createElement('div');
    cursor.id = '__demo-cursor';
    cursor.innerHTML = ARROW;
    root.appendChild(cursor);
    document.documentElement.appendChild(root);
    place(pos.x, pos.y);
    const st = read();
    if (st.badge) setBadge(st.badge);
    if (st.hideCursor) cursor.style.opacity = '0';
  }

  function place(x, y) {
    pos = { x, y };
    if (cursor) cursor.style.transform = `translate(${x - 3}px, ${y - 2}px)`;
  }

  async function moveTo(x, y) {
    mount();
    const from = { ...pos };
    const dx = x - from.x;
    const dy = y - from.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 2) return;
    const duration = Math.min(1100, 320 + dist * 0.55) / speed;
    // A gentle arc: control point pushed sideways by a fraction of the distance.
    const bend = Math.min(90, dist * 0.18) * (dx >= 0 ? -1 : 1);
    const cx = from.x + dx / 2 - (dy / (dist || 1)) * bend;
    const cy = from.y + dy / 2 + (dx / (dist || 1)) * bend;
    const t0 = performance.now();
    await new Promise((resolve) => {
      const step = (now) => {
        const t = Math.min(1, (now - t0) / duration);
        const e = ease(t);
        const px = (1 - e) * (1 - e) * from.x + 2 * (1 - e) * e * cx + e * e * x;
        const py = (1 - e) * (1 - e) * from.y + 2 * (1 - e) * e * cy + e * e * y;
        place(px, py);
        if (t < 1) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
    write({ cursor: pos });
  }

  function ripple(x = pos.x, y = pos.y) {
    mount();
    const r = document.createElement('div');
    r.className = '__demo-ripple';
    r.style.left = `${x}px`;
    r.style.top = `${y}px`;
    root.appendChild(r);
    setTimeout(() => r.remove(), 800);
  }

  function ring(rect, ms = 2400) {
    mount();
    const pad = 6;
    const el = document.createElement('div');
    el.className = '__demo-ring';
    Object.assign(el.style, { left: `${rect.x - pad}px`, top: `${rect.y - pad}px`, width: `${rect.width + pad * 2}px`, height: `${rect.height + pad * 2}px` });
    root.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, ms / speed);
  }

  const COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#db2777', '#0891b2'];
  function setBadge(b) {
    mount();
    if (!b) { if (badge) badge.remove(); badge = null; write({ badge: null }); return; }
    if (!badge) { badge = document.createElement('div'); badge.id = '__demo-badge'; root.appendChild(badge); }
    const initials = b.name.split(' ').map((p) => p[0]).join('').slice(0, 2);
    const color = COLORS[[...b.name].reduce((s, c) => s + c.charCodeAt(0), 0) % COLORS.length];
    badge.innerHTML = `<div class="dot" style="background:${color}">${initials}</div><span>${b.prefix || 'Logged in as'} <b>${b.name}</b> <span class="role">· ${b.role}</span></span>`;
    write({ badge: b });
  }

  async function card(title, kicker, ms) {
    mount();
    const el = document.createElement('div');
    el.id = '__demo-card';
    el.innerHTML = `<div class="inner"><div class="kicker">${kicker || ''}</div><div class="title">${title}</div><div class="bar"></div></div>`;
    root.appendChild(el);
    await sleep(30);
    el.classList.add('show');
    await sleep(ms / speed);
    el.classList.remove('show');
    await sleep(500 / speed);
    el.remove();
  }

  let alertTimer;
  function alertCard(text, tone = 'warn', ms = 4200) {
    mount();
    let el = document.getElementById('__demo-alert');
    if (!el) { el = document.createElement('div'); el.id = '__demo-alert'; root.appendChild(el); }
    el.className = tone;
    el.innerHTML = `<div class="head">localhost:5273 says</div>${text.replace(/</g, '&lt;')}`;
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(alertTimer);
    alertTimer = setTimeout(() => el.classList.remove('show'), ms / speed);
  }

  // A list revealed item by item, each at the moment its sentence is spoken (times in ms from now).
  let recapEl;
  function recap(title, items = [], times = []) {
    mount();
    if (recapEl) { const old = recapEl; old.style.opacity = '0'; setTimeout(() => old.remove(), 400); recapEl = null; }
    if (!title) return;
    recapEl = document.createElement('div');
    Object.assign(recapEl.style, { position: 'fixed', inset: '0', background: 'rgba(15,23,42,.88)', display: 'grid', placeItems: 'center', opacity: '0', transition: 'opacity .45s ease' });
    recapEl.innerHTML = `<div style="width:900px;color:white"><div style="font-size:16px;letter-spacing:.22em;text-transform:uppercase;color:#93c5fd;margin-bottom:26px">${title}</div>${items.map((t, i) => `<div data-i="${i}" style="display:flex;gap:22px;align-items:center;font-size:34px;font-weight:600;margin:20px 0;opacity:.12;transform:translateX(-12px);transition:all .5s ease"><span style="width:52px;height:52px;border-radius:50%;background:#2563eb;display:grid;place-items:center;font-size:24px;flex:none">${i + 1}</span>${t}</div>`).join('')}</div>`;
    root.appendChild(recapEl);
    requestAnimationFrame(() => { recapEl.style.opacity = '1'; });
    times.forEach((t, i) => setTimeout(() => {
      const row = recapEl && recapEl.querySelector(`[data-i="${i}"]`);
      if (row) { row.style.opacity = '1'; row.style.transform = 'none'; }
    }, t));
  }

  // Native title tooltips are drawn by the OS and never reach the screencast; this shows the same text.
  function tooltip(text, x, y, ms = 4500) {
    mount();
    const el = document.createElement('div');
    Object.assign(el.style, { position: 'fixed', left: `${Math.min(x + 14, window.innerWidth - 380)}px`, top: `${y + 22}px`, maxWidth: '360px', padding: '7px 10px', background: '#fffffe', color: '#111827', border: '1px solid #9ca3af', borderRadius: '4px', boxShadow: '0 4px 12px rgba(0,0,0,.18)', fontSize: '13px', lineHeight: '1.4', whiteSpace: 'pre-line', opacity: '0', transition: 'opacity .2s' });
    el.textContent = text;
    root.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, ms / speed);
  }

  function cursorVisible(on) {
    mount();
    cursor.style.opacity = on ? '1' : '0';
    write({ hideCursor: !on });
  }

  window.__demo = {
    moveTo, ripple, ring, setBadge, card, alertCard, cursorVisible, recap, tooltip,
    setSpeed: (s) => { speed = s; write({ speed: s }); },
    pos: () => ({ ...pos }),
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
  window.addEventListener('load', mount);
})();
