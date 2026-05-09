import { ipcMain } from 'electron';
import { execute, queryAll, queryOne } from '../db/client';
import { requireAuth, syncSessionUser } from '../services/auth.service';

export function registerUsersIpc() {
  ipcMain.handle('users:list', async () => queryAll<any>('SELECT id, name, email, role, must_change_password FROM users ORDER BY id'));
  ipcMain.handle('users:save', async (_event, user) => {
    const { default: bcrypt } = await import('bcryptjs');
    if (user.id) {
      await execute('UPDATE users SET name = ?, email = ?, role = ?, must_change_password = ? WHERE id = ?', [
        user.name,
        user.email,
        user.role,
        user.must_change_password ? 1 : 0,
        user.id,
      ]);
      syncSessionUser({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        must_change_password: Boolean(user.must_change_password),
      });
      return user.id;
    }
    const hash = await bcrypt.hash(user.password ?? 'qwertyuiop', 10);
    const result = await execute('INSERT INTO users (name, email, password_hash, role, must_change_password) VALUES (?, ?, ?, ?, ?)', [
      user.name,
      user.email,
      hash,
      user.role,
      user.must_change_password ? 1 : 0,
    ]);
    return result.lastID;
  });
  ipcMain.handle('users:delete', async (_event, userId: number) => {
    const currentUser = await requireAuth();
    if (currentUser.role !== 'admin') {
      throw new Error('Admin access required');
    }
    if (currentUser.id === userId) {
      throw new Error('You cannot delete your own account');
    }

    const target = await queryOne<{ id: number; role: string }>('SELECT id, role FROM users WHERE id = ?', [userId]);
    if (!target) {
      throw new Error('User not found');
    }
    if (target.role === 'admin') {
      const remainingAdmins = await queryOne<{ count: number }>(
        'SELECT COUNT(*) AS count FROM users WHERE role = ? AND id != ?',
        ['admin', userId],
      );
      if (Number(remainingAdmins?.count ?? 0) === 0) {
        throw new Error('At least one admin must remain');
      }
    }

    await execute('DELETE FROM users WHERE id = ?', [userId]);
    return true;
  });
  ipcMain.handle('users:resetPassword', async (_event, userId: number, password: string) => {
    const { default: bcrypt } = await import('bcryptjs');
    const hash = await bcrypt.hash(password, 10);
    await execute('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?', [hash, userId]);
    return true;
  });
}
