import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

type SqlJsDb = import('sql.js').Database;

let db: SqlJsDb | null = null;
let initPromise: Promise<SqlJsDb> | null = null;
let dbPath: string | null = null;

function persist(database: SqlJsDb) {
  if (!dbPath) return;
  const data = database.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

function ensureColumn(database: SqlJsDb, table: string, column: string, definition: string) {
  const stmt = database.prepare(`PRAGMA table_info(${table})`);
  try {
    const columns: Array<{ name: string }> = [];
    while (stmt.step()) {
      columns.push(stmt.getAsObject() as { name: string });
    }

    if (!columns.some((item) => item.name === column)) {
      database.run(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
      return true;
    }
  } finally {
    stmt.free();
  }

  return false;
}

function billsHaveUniquePeriodConstraint(database: SqlJsDb) {
  const row = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'bills'").getAsObject() as { sql?: string };
  return /UNIQUE\s*\(\s*period_month\s*,\s*period_year\s*\)/i.test(row.sql ?? '');
}

function removeBillsUniquePeriodConstraint(database: SqlJsDb) {
  database.run('PRAGMA foreign_keys = OFF;');
  try {
    database.run(`
      BEGIN TRANSACTION;
      DROP TABLE IF EXISTS bills_without_period_unique;
      CREATE TABLE bills_without_period_unique (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_mode TEXT NOT NULL DEFAULT 'auto' CHECK(entry_mode IN ('auto', 'manual')),
        period_month INTEGER NOT NULL,
        period_year INTEGER NOT NULL,
        fixed_unit REAL NOT NULL,
        fixed_unit_price REAL NOT NULL,
        fixed_charge REAL NOT NULL,
        energy_unit REAL NOT NULL,
        energy_unit_price REAL NOT NULL,
        energy_charge REAL NOT NULL,
        extra_charge REAL NOT NULL DEFAULT 0,
        tax REAL NOT NULL DEFAULT 0,
        tax_percent REAL NOT NULL DEFAULT 0,
        interest_charge REAL NOT NULL DEFAULT 0,
        other_charge REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO bills_without_period_unique
        (id, entry_mode, period_month, period_year, fixed_unit, fixed_unit_price, fixed_charge, energy_unit,
         energy_unit_price, energy_charge, extra_charge, tax, tax_percent, interest_charge, other_charge, total,
         created_at, updated_at)
      SELECT id, entry_mode, period_month, period_year, fixed_unit, fixed_unit_price, fixed_charge, energy_unit,
             energy_unit_price, energy_charge, extra_charge, tax, tax_percent, interest_charge, other_charge, total,
             created_at, updated_at
      FROM bills;
      DROP TABLE bills;
      ALTER TABLE bills_without_period_unique RENAME TO bills;
      COMMIT;
    `);
  } catch (error) {
    try {
      database.run('ROLLBACK;');
    } catch {
      // The transaction may already have rolled back.
    }
    throw error;
  } finally {
    database.run('PRAGMA foreign_keys = ON;');
  }
}

async function createDb() {
  const { default: initSqlJs } = await import('sql.js');
  const { default: bcrypt } = await import('bcryptjs');
  const wasmPath = path.join(app.getAppPath(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  const SQL = await initSqlJs({
    locateFile: () => wasmPath,
  });

  const userData = app.getPath('userData');
  fs.mkdirSync(userData, { recursive: true });
  dbPath = path.join(userData, 'billify.sqlite3');

  let database: SqlJsDb;
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    database = new SQL.Database(new Uint8Array(fileBuffer));
  } else {
    database = new SQL.Database();
  }

  database.run('PRAGMA foreign_keys = ON;');
  const migrationPath = path.join(app.getAppPath(), 'electron', 'db', 'migrations', '0001_init.sql');
  database.run(fs.readFileSync(migrationPath, 'utf8'));

  const schemaChanged = ensureColumn(database, 'tenants', 'present_reading', 'present_reading REAL NOT NULL DEFAULT 0');
  const tenantMaintenanceFeesChanged = ensureColumn(
    database,
    'tenants',
    'maintenance_fees',
    'maintenance_fees REAL NOT NULL DEFAULT 0',
  );
  const tenantGeneratorFeesChanged = ensureColumn(
    database,
    'tenants',
    'generator_fees',
    'generator_fees REAL NOT NULL DEFAULT 0',
  );
  const billTaxPercentChanged = ensureColumn(database, 'bills', 'tax_percent', 'tax_percent REAL NOT NULL DEFAULT 0');
  const billEntryModeChanged = ensureColumn(database, 'bills', 'entry_mode', "entry_mode TEXT NOT NULL DEFAULT 'auto'");
  const billOtherChargeChanged = ensureColumn(database, 'bills', 'other_charge', 'other_charge REAL NOT NULL DEFAULT 0');
  const billPeriodUniqueChanged = billsHaveUniquePeriodConstraint(database);
  if (billPeriodUniqueChanged) {
    const backupPath = `${dbPath}.before-duplicate-periods.bak`;
    if (fs.existsSync(dbPath) && !fs.existsSync(backupPath)) {
      fs.copyFileSync(dbPath, backupPath);
    }
    removeBillsUniquePeriodConstraint(database);
  }
  const tenantBillOtherChargeChanged = ensureColumn(
    database,
    'tenant_bills',
    'other_charge_calc',
    'other_charge_calc REAL NOT NULL DEFAULT 0',
  );
  const tenantBillEnergyAdjustChanged = ensureColumn(
    database,
    'tenant_bills',
    'energy_adjust',
    'energy_adjust REAL NOT NULL DEFAULT 0',
  );
  const tenantBillFixedUnitChanged = ensureColumn(database, 'tenant_bills', 'fixed_unit', 'fixed_unit REAL NOT NULL DEFAULT 0');
  const tenantBillFixedUnitPriceChanged = ensureColumn(
    database,
    'tenant_bills',
    'fixed_unit_price',
    'fixed_unit_price REAL NOT NULL DEFAULT 0',
  );
  const tenantBillEnergyUnitPriceChanged = ensureColumn(
    database,
    'tenant_bills',
    'energy_unit_price',
    'energy_unit_price REAL NOT NULL DEFAULT 0',
  );
  const tenantBillTaxAdjustChanged = ensureColumn(database, 'tenant_bills', 'tax_adjust', 'tax_adjust REAL NOT NULL DEFAULT 0');
  const tenantBillOtherAdjustChanged = ensureColumn(
    database,
    'tenant_bills',
    'other_adjust',
    'other_adjust REAL NOT NULL DEFAULT 0',
  );
  const tenantBillMaintenanceFeeChanged = ensureColumn(database, 'tenant_bills', 'maintenance_fee', 'maintenance_fee REAL NOT NULL DEFAULT 0');
  const tenantBillGeneratorFeeChanged = ensureColumn(database, 'tenant_bills', 'generator_fee', 'generator_fee REAL NOT NULL DEFAULT 0');
  const tenantBillManagementExtraFeeChanged = ensureColumn(database, 'tenant_bills', 'management_extra_fee', 'management_extra_fee REAL NOT NULL DEFAULT 0');
  const tenantBillManagementTotalChanged = ensureColumn(database, 'tenant_bills', 'management_total', 'management_total REAL NOT NULL DEFAULT 0');
  if (
    tenantBillMaintenanceFeeChanged ||
    tenantBillGeneratorFeeChanged ||
    tenantBillManagementExtraFeeChanged ||
    tenantBillManagementTotalChanged
  ) {
    const backupPath = `${dbPath}.before-integrated-management.bak`;
    if (fs.existsSync(dbPath) && !fs.existsSync(backupPath)) {
      fs.copyFileSync(dbPath, backupPath);
    }
  }
  const tenantBillPaymentStatusChanged = ensureColumn(
    database,
    'tenant_bills',
    'payment_status',
    "payment_status TEXT NOT NULL DEFAULT 'pending'",
  );
  const tenantBillPaymentMethodChanged = ensureColumn(
    database,
    'tenant_bills',
    'payment_method',
    'payment_method TEXT',
  );
  const tenantBillPaymentDateChanged = ensureColumn(
    database,
    'tenant_bills',
    'payment_date',
    'payment_date TEXT',
  );
  const configRenameApplied = (() => {
    database.run(`
      INSERT OR IGNORE INTO app_config (key, value)
      SELECT 'whatsapp_electricity_bill_template', value
      FROM app_config
      WHERE key = 'whatsapp_template_name'
    `);
    const inserted = database.getRowsModified() > 0;
    database.run(`DELETE FROM app_config WHERE key = 'whatsapp_template_name'`);
    const deleted = database.getRowsModified() > 0;
    return inserted || deleted;
  })();

  const seedRow = database.prepare('SELECT id FROM users WHERE email IN (?, ?)').getAsObject(['admin', 'admin@local']) as { id?: number };
  if (!seedRow.id) {
    const hash = bcrypt.hashSync('admin', 10);
    database.run(
      'INSERT INTO users (name, email, password_hash, role, must_change_password) VALUES (?, ?, ?, ?, ?)',
      ['Default Admin', 'admin', hash, 'admin', 0],
    );
    persist(database);
  } else if (
    schemaChanged ||
    tenantMaintenanceFeesChanged ||
    tenantGeneratorFeesChanged ||
    billTaxPercentChanged ||
    billEntryModeChanged ||
    billOtherChargeChanged ||
    billPeriodUniqueChanged ||
    tenantBillOtherChargeChanged ||
    tenantBillEnergyAdjustChanged ||
    tenantBillFixedUnitChanged ||
    tenantBillFixedUnitPriceChanged ||
    tenantBillEnergyUnitPriceChanged ||
    tenantBillTaxAdjustChanged ||
    tenantBillOtherAdjustChanged ||
    tenantBillMaintenanceFeeChanged ||
    tenantBillGeneratorFeeChanged ||
    tenantBillManagementExtraFeeChanged ||
    tenantBillManagementTotalChanged ||
    tenantBillPaymentStatusChanged ||
    tenantBillPaymentMethodChanged ||
    tenantBillPaymentDateChanged ||
    configRenameApplied
  ) {
    persist(database);
  }

  return database;
}

async function getDatabase() {
  if (db) return db;
  if (!initPromise) {
    initPromise = createDb().then((database) => {
      db = database;
      return database;
    });
  }
  return initPromise;
}

export async function getDb() {
  return getDatabase();
}

function runQuery<T = Record<string, unknown>>(database: SqlJsDb, sql: string, params: unknown[] = []) {
  const stmt = database.prepare(sql);
  try {
    stmt.bind(params);
    const rows: T[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as T);
    }
    return rows;
  } finally {
    stmt.free();
  }
}

export async function queryOne<T = unknown>(sql: string, params: unknown[] = []) {
  const database = await getDatabase();
  const rows = runQuery<T>(database, sql, params);
  return rows[0];
}

export async function queryAll<T = unknown>(sql: string, params: unknown[] = []) {
  const database = await getDatabase();
  return runQuery<T>(database, sql, params);
}

export async function execute(sql: string, params: unknown[] = []) {
  const database = await getDatabase();
  const stmt = database.prepare(sql);
  try {
    stmt.run(params);
    const row = runQuery<{ lastID: number }>(database, 'SELECT last_insert_rowid() AS lastID');
    persist(database);
    return { lastID: Number(row[0]?.lastID ?? 0), changes: database.getRowsModified() };
  } finally {
    stmt.free();
  }
}

export async function transaction<T>(fn: (database: SqlJsDb) => T) {
  const database = await getDatabase();
  database.run('BEGIN IMMEDIATE;');
  try {
    const result = fn(database);
    database.run('COMMIT;');
    persist(database);
    return result;
  } catch (error) {
    try {
      database.run('ROLLBACK;');
    } catch {
      // ignore rollback errors
    }
    throw error;
  }
}
