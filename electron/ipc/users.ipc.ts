import { ipcMain } from 'electron';
import { execute, queryAll, queryOne } from '../db/client';

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
      return user.id;
    }
    const hash = await bcrypt.hash(user.password ?? 'admin', 10);
    const result = await execute('INSERT INTO users (name, email, password_hash, role, must_change_password) VALUES (?, ?, ?, ?, ?)', [
      user.name,
      user.email,
      hash,
      user.role,
      user.must_change_password ? 1 : 0,
    ]);
    return result.lastID;
  });
  ipcMain.handle('users:resetPassword', async (_event, userId: number, password: string) => {
    const { default: bcrypt } = await import('bcryptjs');
    const hash = await bcrypt.hash(password, 10);
    await execute('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?', [hash, userId]);
    return true;
  });
}
