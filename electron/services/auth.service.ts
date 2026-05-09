import type { SessionUser } from '../../src/types';
import { execute, queryOne } from '../db/client';

let currentUser: SessionUser | null = null;

export async function login(email: string, password: string) {
  const { default: bcrypt } = await import('bcryptjs');
  const user = await queryOne<any>('SELECT * FROM users WHERE email = ?', [email]);
  if (!user) {
    return { ok: false as const, message: 'Invalid credentials' };
  }
  const matches = await bcrypt.compare(password, user.password_hash);
  if (!matches) {
    return { ok: false as const, message: 'Invalid credentials' };
  }
  currentUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    must_change_password: Boolean(user.must_change_password),
  };
  return { ok: true as const, user: currentUser };
}

export async function getSession() {
  return currentUser;
}

export async function logout() {
  currentUser = null;
}

export async function changePassword(userId: number, password: string) {
  const { default: bcrypt } = await import('bcryptjs');
  const hash = await bcrypt.hash(password, 10);
  await execute('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [hash, userId]);
  if (currentUser?.id === userId) {
    currentUser = { ...currentUser, must_change_password: false };
  }
}

export function syncSessionUser(user: SessionUser) {
  if (currentUser?.id === user.id) {
    currentUser = { ...user };
  }
}

export async function requireAuth() {
  if (!currentUser) {
    throw new Error('Not authenticated');
  }
  return currentUser;
}
