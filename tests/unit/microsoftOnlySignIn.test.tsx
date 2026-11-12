// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const loginWithMicrosoft = vi.fn();
vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => ({ loginWithMicrosoft }) }));

import SignInForm from '../../src/components/auth/SignInForm';
import { MICROSOFT_FAILED_MESSAGE, createMicrosoftServerError } from '../../src/utils/microsoftSignInErrors';

const read = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');
const serverSrc = read('server.cjs');

describe('POST /api/auth/login is turned off', () => {
  const start = serverSrc.search(/app\.post\(\s*['"]\/api\/auth\/login['"]\s*,/);
  const route = serverSrc.slice(start, serverSrc.indexOf('\napp.', start + 1));

  it('answers 410 without reading the body, checking a password or issuing a token', () => {
    expect(start).toBeGreaterThan(-1);
    expect(route).toMatch(/status\(410\)/);
    expect(route).not.toMatch(/req\.body|bcrypt|jwt\.sign|findOne|db\./);
  });

  it('the server no longer loads any password sign-in code', () => {
    expect(serverSrc).not.toMatch(/password-login|MANUAL_LOGIN|loginLimiter|bcrypt/);
    expect(fs.existsSync(path.resolve(process.cwd(), 'password-login.cjs'))).toBe(false);
    expect(fs.existsSync(path.resolve(process.cwd(), 'scripts/create-default-login.cjs'))).toBe(false);
  });
});

describe('frontend has no password sign-in', () => {
  it('AuthContext never calls the password endpoint', () => {
    expect(read('src/contexts/AuthContext.tsx')).not.toContain('/api/auth/login');
    expect(read('src/config/api.ts')).not.toContain('/api/auth/login');
  });

  it('/signup sends people to the Microsoft sign-in page', () => {
    expect(read('src/App.tsx')).toMatch(/path="\/signup" element={<Navigate to="\/signin" replace \/>}/);
    expect(fs.existsSync(path.resolve(process.cwd(), 'src/components/auth/SignUpForm.tsx'))).toBe(false);
  });
});

describe('SignInForm', () => {
  beforeEach(() => {
    loginWithMicrosoft.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows only the Microsoft button, with no email or password fields', () => {
    const { container } = render(<SignInForm />);
    expect(screen.getByRole('button', { name: /continue with microsoft account/i })).toBeTruthy();
    expect(container.querySelector('input')).toBeNull();
    expect(screen.queryByText(/manual sign in/i)).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('calls onSuccess when Microsoft sign-in works', async () => {
    loginWithMicrosoft.mockResolvedValue(true);
    const onSuccess = vi.fn();
    render(<SignInForm onSuccess={onSuccess} />);
    fireEvent.click(screen.getByRole('button', { name: /continue with microsoft account/i }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });

  it('shows a retry message, not an email/password hint, when Microsoft sign-in fails', async () => {
    loginWithMicrosoft.mockResolvedValue(false);
    const onError = vi.fn();
    render(<SignInForm onError={onError} />);
    fireEvent.click(screen.getByRole('button', { name: /continue with microsoft account/i }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(MICROSOFT_FAILED_MESSAGE);
    expect(alert.textContent).not.toMatch(/password/i);
    expect(onError).toHaveBeenCalledWith(MICROSOFT_FAILED_MESSAGE);
  });

  it.each([
    ['the error code', Object.assign(new Error('other'), { code: 'NOT_CONFIGURED' })],
    ['the error message', new Error('NOT_CONFIGURED')],
  ])('tells people to contact an administrator when not configured (detected by %s)', async (_label, error) => {
    loginWithMicrosoft.mockRejectedValue(error);
    render(<SignInForm />);
    fireEvent.click(screen.getByRole('button', { name: /continue with microsoft account/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/contact your administrator/i);
  });

  it("shows the server's own message when the server refuses the Microsoft sign-in", async () => {
    loginWithMicrosoft.mockRejectedValue(createMicrosoftServerError(403, 'Only cloudfuze.com accounts can sign in'));
    const onError = vi.fn();
    render(<SignInForm onError={onError} />);
    fireEvent.click(screen.getByRole('button', { name: /continue with microsoft account/i }));
    expect((await screen.findByRole('alert')).textContent).toBe('Only cloudfuze.com accounts can sign in');
    expect(onError).toHaveBeenCalledWith('Only cloudfuze.com accounts can sign in');
  });
});
