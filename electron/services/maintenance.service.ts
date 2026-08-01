import { transaction } from '../db/client';

export async function resetAllData() {
  const { default: bcrypt } = await import('bcryptjs');
  const passwordHash = bcrypt.hashSync('admin', 10);

  return transaction((db) => {
    db.run('PRAGMA foreign_keys = OFF;');

    const tableNames: string[] = [];
    const tablesStmt = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'app_config'",
    );
    try {
      while (tablesStmt.step()) {
        tableNames.push((tablesStmt.getAsObject() as { name: string }).name);
      }
    } finally {
      tablesStmt.free();
    }

    for (const table of tableNames) {
      db.run(`DELETE FROM "${table}"`);
    }

    const sequenceStmt = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'");
    const hasSequenceTable = sequenceStmt.step();
    sequenceStmt.free();
    if (hasSequenceTable) {
      db.run('DELETE FROM sqlite_sequence');
    }

    db.run('INSERT INTO users (name, email, password_hash, role, must_change_password) VALUES (?, ?, ?, ?, ?)', [
      'Default Admin',
      'admin',
      passwordHash,
      'admin',
      0,
    ]);

    db.run('PRAGMA foreign_keys = ON;');
    return { ok: true as const };
  });
}
