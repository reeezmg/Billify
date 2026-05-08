import { ipcMain } from 'electron';
import { changePassword, getSession, login, logout } from '../services/auth.service';

export function registerAuthIpc() {
  ipcMain.handle('auth:getSession', async () => getSession());
  ipcMain.handle('auth:login', async (_event, email: string, password: string) => login(email, password));
  ipcMain.handle('auth:logout', async () => logout());
  ipcMain.handle('auth:changePassword', async (_event, userId: number, password: string) => changePassword(userId, password));
}
