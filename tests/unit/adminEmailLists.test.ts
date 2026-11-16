import { describe, it, expect } from 'vitest';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import lists from '../../admin-email-lists.cjs';

const { normalizeAdminEmail, parseEnvEmails, createAdminEmailList } = lists as {
  normalizeAdminEmail: (raw: unknown) => { ok: boolean; value?: string; code?: string };
  parseEnvEmails: (s: unknown) => string[];
  createAdminEmailList: (opts: Record<string, unknown>) => any;
};

type Call = { op: string; args: any[] };

// Applies $addToSet / $pull for real so tests see the stored state, like Mongo would.
function fakeDb(
  initial: { emails?: string[]; updatedAt?: Date; updatedBy?: string } | null = null,
  opts: { failRead?: boolean } = {},
) {
  let doc: any = initial ? { _id: 'exhibit_admins', ...initial } : null;
  const calls: Call[] = [];
  const db = {
    collection(name: string) {
      expect(name).toBe('settings');
      return {
        async findOne(filter: any) {
          calls.push({ op: 'findOne', args: [filter] });
          if (opts.failRead) throw new Error('db down');
          return doc && filter._id === doc._id ? { ...doc, emails: [...(doc.emails || [])] } : null;
        },
        async updateOne(filter: any, update: any, options: any) {
          calls.push({ op: 'updateOne', args: [filter, update, options] });
          const capKey = Object.keys(filter).find((k) => /^emails\.\d+$/.test(k));
          const capHit = !!(doc && capKey && doc.emails.length > Number(capKey.split('.')[1]));
          const inMiss = filter.emails && !(doc && doc.emails.some((e: string) => filter.emails.$in.includes(e)));
          if (!doc || capHit || inMiss) {
            if (!(options && options.upsert)) return { matchedCount: 0, modifiedCount: 0 };
            // Mongo's upsert inserts when the filter misses; an existing _id makes that a duplicate key.
            if (doc) throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
            doc = { _id: filter._id, emails: [] };
          }
          let modified = 0;
          if (update.$addToSet && !doc.emails.includes(update.$addToSet.emails)) { doc.emails.push(update.$addToSet.emails); modified = 1; }
          if (update.$pull) {
            const before = doc.emails.length;
            doc.emails = doc.emails.filter((e: string) => !update.$pull.emails.$in.includes(e));
            modified = before !== doc.emails.length ? 1 : 0;
          }
          Object.assign(doc, update.$set || {});
          return { matchedCount: 1, modifiedCount: modified };
        },
      };
    },
  };
  return { db, calls, current: () => doc };
}

function makeList(env: Record<string, string> = {}, maxSize?: number) {
  return createAdminEmailList({ settingsId: 'exhibit_admins', envVar: 'EXHIBIT_ADMIN_EMAILS', env, ...(maxSize ? { maxSize } : {}) });
}

describe('normalizeAdminEmail', () => {
  it('accepts a valid address and lowercases and trims it', () => {
    expect(normalizeAdminEmail('  Jane.Doe@CloudFuze.com ')).toEqual({ ok: true, value: 'jane.doe@cloudfuze.com' });
  });

  it.each([
    ['not-an-email'],
    [''],
    ['   '],
    ['a@b'],
    ['a b@c.com'],
    ['a@b.com,evil@x.com'],
    ['a@b.com;evil@x.com'],
    ['<a@b.com>'],
    [`${'a'.repeat(250)}@b.com`],
  ])('rejects %j', (raw) => {
    expect(normalizeAdminEmail(raw)).toMatchObject({ ok: false, code: 'INVALID_EMAIL' });
  });

  it.each([[null], [undefined], [42], [{ $ne: '' }], [['a@b.com']]])('rejects non-string %j', (raw) => {
    expect(normalizeAdminEmail(raw).ok).toBe(false);
  });
});

describe('parseEnvEmails', () => {
  it('splits, normalizes, de-duplicates and drops invalid entries', () => {
    expect(parseEnvEmails(' A@x.com, b@x.com ,,a@X.com, bogus ')).toEqual(['a@x.com', 'b@x.com']);
  });

  it('returns [] for a missing value', () => {
    expect(parseEnvEmails(undefined)).toEqual([]);
  });
});

describe('hasAccess', () => {
  it('grants env members without reading the database', async () => {
    const { db, calls } = fakeDb();
    expect(await makeList({ EXHIBIT_ADMIN_EMAILS: 'env@x.com' }).hasAccess(db, { email: 'ENV@x.com' })).toBe(true);
    expect(calls).toEqual([]);
  });

  it('grants members stored in settings', async () => {
    const { db } = fakeDb({ emails: ['db@x.com'] });
    expect(await makeList().hasAccess(db, { email: ' db@X.com' })).toBe(true);
  });

  it('denies everyone else, and users with no email', async () => {
    const { db } = fakeDb({ emails: ['db@x.com'] });
    const list = makeList({ EXHIBIT_ADMIN_EMAILS: 'env@x.com' });
    expect(await list.hasAccess(db, { email: 'other@x.com' })).toBe(false);
    expect(await list.hasAccess(db, {})).toBe(false);
    expect(await list.hasAccess(db, null)).toBe(false);
  });

  it('fails closed when the settings read errors', async () => {
    const { db } = fakeDb({ emails: ['db@x.com'] }, { failRead: true });
    expect(await makeList().hasAccess(db, { email: 'db@x.com' })).toBe(false);
  });

  it('has no hardcoded defaults', async () => {
    const { db } = fakeDb();
    expect(await makeList().hasAccess(db, { email: 'anush.dasari@cloudfuze.com' })).toBe(false);
  });
});

describe('add', () => {
  it('adds atomically with $addToSet and records who and when', async () => {
    const { db, calls, current } = fakeDb();
    const out = await makeList().add(db, ' New@X.com ', 'admin@x.com');
    expect(out).toMatchObject({ ok: true, httpStatus: 200, changed: true, email: 'new@x.com' });
    const write = calls.find((c) => c.op === 'updateOne')!;
    expect(write.args[1].$addToSet).toEqual({ emails: 'new@x.com' });
    expect(write.args[1].$set.updatedBy).toBe('admin@x.com');
    expect(write.args[1].$set.updatedAt).toBeInstanceOf(Date);
    expect(write.args[2]).toEqual({ upsert: true });
    expect(write.args[1]).not.toHaveProperty('$set.emails');
    expect(current().emails).toEqual(['new@x.com']);
    expect(out.data).toMatchObject({ emails: ['new@x.com'], envEmails: [], updatedBy: 'admin@x.com' });
  });

  it('is idempotent: an email already present is not written again', async () => {
    const { db, calls } = fakeDb({ emails: ['a@x.com'] });
    const out = await makeList().add(db, 'A@x.com', 'admin@x.com');
    expect(out).toMatchObject({ ok: true, httpStatus: 200, changed: false, message: 'Email already in list' });
    expect(calls.some((c) => c.op === 'updateOne')).toBe(false);
  });

  it('treats an env member as already present', async () => {
    const { db, calls } = fakeDb();
    const out = await makeList({ EXHIBIT_ADMIN_EMAILS: 'env@x.com' }).add(db, 'env@x.com', 'admin@x.com');
    expect(out).toMatchObject({ ok: true, changed: false });
    expect(calls.some((c) => c.op === 'updateOne')).toBe(false);
  });

  it('rejects an invalid email with 400 INVALID_EMAIL and writes nothing', async () => {
    const { db, calls } = fakeDb();
    const out = await makeList().add(db, 'a@b.com,c@d.com', 'admin@x.com');
    expect(out).toMatchObject({ ok: false, httpStatus: 400, code: 'INVALID_EMAIL' });
    expect(calls).toEqual([]);
  });

  it('rejects with 400 LIST_FULL when the cap is reached', async () => {
    const { db, calls } = fakeDb({ emails: ['a@x.com', 'b@x.com'] });
    const out = await makeList({}, 2).add(db, 'c@x.com', 'admin@x.com');
    expect(out).toMatchObject({ ok: false, httpStatus: 400, code: 'LIST_FULL' });
    expect(calls.some((c) => c.op === 'updateOne')).toBe(false);
  });

  it('puts the cap in the write filter so concurrent adds cannot overfill the list', async () => {
    const { db, calls } = fakeDb({ emails: ['a@x.com'] });
    await makeList({}, 2).add(db, 'b@x.com', 'admin@x.com');
    expect(calls.find((c) => c.op === 'updateOne')!.args[0]).toEqual({ _id: 'exhibit_admins', 'emails.1': { $exists: false } });
  });

  it('answers LIST_FULL when another add filled the list between the check and the write', async () => {
    const list = makeList({}, 2);
    const { db, current } = fakeDb({ emails: ['a@x.com'] });
    const results = await Promise.all([list.add(db, 'b@x.com', 'admin@x.com'), list.add(db, 'c@x.com', 'admin@x.com')]);
    expect(results.map((r: any) => r.code ?? 'OK').sort()).toEqual(['LIST_FULL', 'OK']);
    expect(current().emails).toHaveLength(2);
  });

  it('retries once when two first-ever adds race to create the settings doc', async () => {
    const { db, current } = fakeDb();
    const settings = db.collection('settings');
    let first = true;
    const racing = {
      collection: () => ({
        findOne: settings.findOne,
        async updateOne(filter: any, update: any, options: any) {
          if (first) { first = false; throw Object.assign(new Error('E11000'), { code: 11000 }); }
          return settings.updateOne(filter, update, options);
        },
      }),
    };
    await expect(makeList().add(racing, 'a@x.com', 'admin@x.com')).resolves.toMatchObject({ ok: true, changed: true });
    expect(current().emails).toEqual(['a@x.com']);
  });
});

describe('remove', () => {
  it('removes atomically with $pull', async () => {
    const { db, calls, current } = fakeDb({ emails: ['a@x.com', 'b@x.com'] });
    const out = await makeList().remove(db, 'A@x.com', 'admin@x.com');
    expect(out).toMatchObject({ ok: true, httpStatus: 200, changed: true, email: 'a@x.com' });
    const write = calls.find((c) => c.op === 'updateOne')!;
    expect(write.args[1].$pull).toEqual({ emails: { $in: ['a@x.com'] } });
    expect(current().emails).toEqual(['b@x.com']);
  });

  it('removes stored entries regardless of their case', async () => {
    const { db, calls, current } = fakeDb({ emails: ['Mixed@X.com', 'mixed@x.com', 'b@x.com'] });
    const out = await makeList().remove(db, 'MIXED@x.com', 'admin@x.com');
    expect(out).toMatchObject({ ok: true, changed: true });
    expect(calls.find((c) => c.op === 'updateOne')!.args[1].$pull).toEqual({ emails: { $in: ['Mixed@X.com', 'mixed@x.com'] } });
    expect(current().emails).toEqual(['b@x.com']);
  });

  it('is idempotent when the email is not in the list', async () => {
    const { db } = fakeDb({ emails: ['b@x.com'] });
    const out = await makeList().remove(db, 'a@x.com', 'admin@x.com');
    expect(out).toMatchObject({ ok: true, httpStatus: 200, changed: false });
  });

  it('refuses to remove an env-managed email (409 ENV_MANAGED)', async () => {
    const { db, calls } = fakeDb();
    const out = await makeList({ EXHIBIT_ADMIN_EMAILS: 'env@x.com' }).remove(db, 'ENV@x.com', 'admin@x.com');
    expect(out).toMatchObject({ ok: false, httpStatus: 409, code: 'ENV_MANAGED' });
    expect(calls.some((c) => c.op === 'updateOne')).toBe(false);
  });

  it('rejects an invalid email with 400', async () => {
    const { db } = fakeDb();
    expect(await makeList().remove(db, 'nope', 'admin@x.com')).toMatchObject({ ok: false, httpStatus: 400, code: 'INVALID_EMAIL' });
  });
});

describe('snapshot', () => {
  it('lists env members first and flags them, without duplicating a DB copy', async () => {
    const { db } = fakeDb({ emails: ['env@x.com', 'db@x.com'], updatedBy: 'admin@x.com' });
    const out = await makeList({ EXHIBIT_ADMIN_EMAILS: 'env@x.com' }).snapshot(db);
    expect(out).toEqual({ emails: ['env@x.com', 'db@x.com'], envEmails: ['env@x.com'], updatedAt: null, updatedBy: 'admin@x.com' });
  });
});
