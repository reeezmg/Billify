CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','staff')),
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_no TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  present_reading REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(period_month, period_year)
);

CREATE TABLE IF NOT EXISTS bill_splits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL UNIQUE REFERENCES bills(id) ON DELETE CASCADE,
  reading_date TEXT NOT NULL,
  tax_rate REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'finalized', 'sent')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tenant_bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_split_id INTEGER NOT NULL REFERENCES bill_splits(id) ON DELETE CASCADE,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  previous_reading REAL NOT NULL,
  present_reading REAL NOT NULL,
  consumed_unit REAL NOT NULL,
  fixed_charge_calc REAL NOT NULL,
  fixed_adjust REAL NOT NULL DEFAULT 0,
  energy_charge REAL NOT NULL,
  extra_charge_calc REAL NOT NULL,
  extra_adjust REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL,
  sub_total REAL NOT NULL,
  interest_charge_calc REAL NOT NULL,
  interest_adjust REAL NOT NULL DEFAULT 0,
  other_charge_calc REAL NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK(payment_status IN ('pending', 'paid')),
  payment_method TEXT CHECK(payment_method IN ('cash', 'upi', 'card')),
  payment_date TEXT,
  payable REAL NOT NULL,
  whatsapp_sent_at TEXT,
  whatsapp_message_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(bill_split_id, tenant_id)
);

CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT
);
