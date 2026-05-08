import { ipcMain } from 'electron';
import { getSettings, saveSettings } from '../services/settings.service';

export function registerSettingsIpc() {
  ipcMain.handle('settings:get', async () => getSettings());
  ipcMain.handle('settings:save', async (_event, settings) => saveSettings(settings));
}
