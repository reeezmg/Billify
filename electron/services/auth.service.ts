import type ElectronStore from 'electron-store';
import type { SessionUser } from '../../src/types';
import { execute, queryOne } from '../db/client';

let currentUser: SessionUser | null = null;

type PersistedSession = { userId: number | null };

let store: ElectronStore<PersistedSession> | null = null;

async function getStore() {
  if (!store) {
    const { default: Store } = await import('electron-store');
    store = new Store<PersistedSession>({ name: 'session', defaults: { userId: null } });
  }
  return store;
}

function toSessionUser(user: any): SessionUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    must_change_password: Boolean(user.must_change_password),
  };
}

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
  currentUser = toSessionUser(user);
  (await getStore()).set('userId', currentUser.id);
  return { ok: true as const, user: currentUser };
}

async function restoreSession() {
  if (currentUser) {
    return currentUser;
  }

  const persistedId = (await getStore()).get('userId');
  if (!persistedId) {
    return null;
  }

  const user = await queryOne<any>('SELECT * FROM users WHERE id = ?', [persistedId]);
  if (!user) {
    (await getStore()).set('userId', null);
    return null;
  }

  currentUser = toSessionUser(user);
  return currentUser;
}

export async function getSession() {
  return restoreSession();
}

export async function logout() {
  currentUser = null;
  (await getStore()).set('userId', null);
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
  const user = await restoreSession();
  if (!user) {
    throw new Error('Not authenticated');
  }
  return user;
}
