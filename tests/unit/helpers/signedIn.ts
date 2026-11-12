export const SIGNED_IN_USER = { id: 'u1', email: 'rep@example.com', name: 'Rep', role: 'user' };

// A JWT-shaped token that hasUsableAuthToken accepts; the server is never asked to verify it in tests
export function signIn(): void {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }));
  localStorage.setItem('cpq_token', `header.${payload}.signature`);
  localStorage.setItem('cpq_user', JSON.stringify(SIGNED_IN_USER));
}
