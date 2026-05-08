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
  const billTaxPercentChanged = ensureColumn(database, 'bills', 'tax_percent', 'tax_percent REAL NOT NULL DEFAULT 0');
  const billOtherChargeChanged = ensureColumn(database, 'bills', 'other_charge', 'other_charge REAL NOT NULL DEFAULT 0');
  const tenantBillOtherChargeChanged = ensureColumn(
    database,
    'tenant_bills',
    'other_charge_calc',
    'other_charge_calc REAL NOT NULL DEFAULT 0',
  );
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

  const seedRow = database.prepare('SELECT id FROM users WHERE email = ?').getAsObject(['admin@local']) as { id?: number };
  if (!seedRow.id) {
    const hash = bcrypt.hashSync('admin', 10);
    database.run(
      'INSERT INTO users (name, email, password_hash, role, must_change_password) VALUES (?, ?, ?, ?, ?)',
      ['Default Admin', 'admin@local', hash, 'admin', 1],
    );
    persist(database);
  } else if (
    schemaChanged ||
    billTaxPercentChanged ||
    billOtherChargeChanged ||
    tenantBillOtherChargeChanged ||
    tenantBillPaymentStatusChanged ||
    tenantBillPaymentMethodChanged ||
    tenantBillPaymentDateChanged
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
