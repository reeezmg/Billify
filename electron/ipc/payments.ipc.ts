import { ipcMain } from 'electron';
import { listPayments } from '../services/payments.service';

export function registerPaymentsIpc() {
  ipcMain.handle('payments:list', async () => listPayments());
}
