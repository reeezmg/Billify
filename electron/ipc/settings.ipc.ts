import { ipcMain } from 'electron';
import { getSettings, saveSettings } from '../services/settings.service';
import { resetAllData } from '../services/maintenance.service';
import { logout, requireAuth } from '../services/auth.service';

export function registerSettingsIpc() {
  ipcMain.handle('settings:get', async () => getSettings());
  ipcMain.handle('settings:save', async (_event, settings) => saveSettings(settings));
  ipcMain.handle('settings:resetData', async () => {
    const currentUser = await requireAuth();
    if (currentUser.role !== 'admin') {
      throw new Error('Admin access required');
    }
    const result = await resetAllData();
    await logout();
    return result;
  });
}
