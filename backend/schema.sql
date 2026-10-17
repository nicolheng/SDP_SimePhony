-- SimePhony schema (draft — P3 + P4 finalise on Day 1)

CREATE TABLE IF NOT EXISTS units (
    unit_id     TEXT PRIMARY KEY,          -- e.g. A-12-08
    block       TEXT NOT NULL,
    floor       INTEGER NOT NULL,
    stack       TEXT NOT NULL,             -- e.g. 08
    contractor  TEXT
);

CREATE TABLE IF NOT EXISTS buyers (
    buyer_id    TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    email       TEXT NOT NULL,
    unit_id     TEXT REFERENCES units(unit_id)
);

CREATE TABLE IF NOT EXISTS technicians (
    technician_id TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL,
    skills        TEXT NOT NULL,           -- JSON array
    blocks        TEXT NOT NULL            -- JSON array of covered blocks
);

CREATE TABLE IF NOT EXISTS slots (
    slot_id       TEXT PRIMARY KEY,
    technician_id TEXT NOT NULL REFERENCES technicians(technician_id),
    start_at      TEXT NOT NULL,
    end_at        TEXT NOT NULL,
    case_id       TEXT REFERENCES cases(case_id),   -- NULL = free
    kind          TEXT                              -- visit | repair
);

CREATE TABLE IF NOT EXISTS cases (
    case_id          TEXT PRIMARY KEY,
    unit_id          TEXT NOT NULL REFERENCES units(unit_id),
    buyer_id         TEXT NOT NULL REFERENCES buyers(buyer_id),
    status           TEXT NOT NULL DEFAULT 'SUBMITTED',
    category         TEXT,
    sub_category     TEXT,
    location_in_unit TEXT,
    summary          TEXT,
    description      TEXT,
    urgency          TEXT,
    technician_id    TEXT REFERENCES technicians(technician_id),
    reopen_count     INTEGER NOT NULL DEFAULT 0,
    developer_signed INTEGER NOT NULL DEFAULT 0,
    buyer_signed     INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT NOT NULL,
    closed_at        TEXT
);

CREATE TABLE IF NOT EXISTS case_photos (
    photo_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id    TEXT NOT NULL REFERENCES cases(case_id),
    path       TEXT NOT NULL,              -- relative to uploads/
    kind       TEXT NOT NULL,              -- original | reopen | verdict
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS case_events (
    event_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id    TEXT REFERENCES cases(case_id),
    type       TEXT NOT NULL,              -- see CONTRACTS.md §3
    payload    TEXT,                       -- JSON
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS approvals (
    approval_id TEXT PRIMARY KEY,
    case_id     TEXT NOT NULL REFERENCES cases(case_id),
    reasons     TEXT,                      -- JSON array
    status      TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
    decided_by  TEXT,
    created_at  TEXT NOT NULL,
    decided_at  TEXT
);

CREATE TABLE IF NOT EXISTS inspection_briefs (
    case_id    TEXT PRIMARY KEY REFERENCES cases(case_id),
    brief      TEXT NOT NULL,              -- JSON / markdown
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS case_embeddings (
    case_id   TEXT PRIMARY KEY REFERENCES cases(case_id),
    model     TEXT NOT NULL,
    vector    BLOB NOT NULL                -- float32 numpy bytes
);

CREATE TABLE IF NOT EXISTS outbox (
    email_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id    TEXT REFERENCES cases(case_id),
    to_addr    TEXT NOT NULL,
    subject    TEXT NOT NULL,
    body       TEXT NOT NULL,
    status     TEXT NOT NULL,              -- sent | logged, not sent
    error      TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cases_unit   ON cases(unit_id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_events_case  ON case_events(case_id);
