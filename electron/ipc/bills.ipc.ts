import { ipcMain } from 'electron';
import { createBill, getBill, getOrCreateSplit, listBills, upsertBill } from '../services/bill.service';

export function registerBillsIpc() {
  ipcMain.handle('bills:list', async () => listBills());
  ipcMain.handle('bills:create', async (_event, bill) => createBill(bill));
  ipcMain.handle('bills:save', async (_event, bill) => upsertBill(bill));
  ipcMain.handle('bills:get', async (_event, id: number) => getBill(id));
  ipcMain.handle('bills:getOrCreateSplit', async (_event, billId: number) => getOrCreateSplit(billId));
}
