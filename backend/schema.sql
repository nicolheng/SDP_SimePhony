-- SimePhony schema (draft — P3 + P4 finalise on Day 1)
-- Matches the frontend mock types in frontend/src/lib/types.ts.

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
    case_id            TEXT PRIMARY KEY,
    unit_id            TEXT NOT NULL REFERENCES units(unit_id),
    buyer_id           TEXT NOT NULL REFERENCES buyers(buyer_id),
    status             TEXT NOT NULL DEFAULT 'SUBMITTED',   -- CONTRACTS.md §1
    -- IntakeAgent
    category           TEXT,
    sub_category       TEXT,
    location_in_unit   TEXT,
    summary            TEXT,
    description        TEXT,
    urgency            TEXT,                                -- high | normal | low
    missing_info       TEXT,                                -- JSON array
    follow_up_question TEXT,
    -- SimilarDefectAgent / RecurrenceAgent
    occurrence_count   INTEGER NOT NULL DEFAULT 1,          -- reports of this defect in this unit
    reopen_count       INTEGER NOT NULL DEFAULT 0,
    -- TriageAgent
    technician_id      TEXT REFERENCES technicians(technician_id),
    triage_reason      TEXT,
    -- Technician
    verdict            TEXT,                                -- VALID | INVALID
    verdict_note       TEXT,
    verdict_at         TEXT,
    repair_note        TEXT,
    repaired_at        TEXT,
    created_at         TEXT NOT NULL,
    closed_at          TEXT
);

CREATE TABLE IF NOT EXISTS case_photos (
    photo_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id    TEXT NOT NULL REFERENCES cases(case_id),
    path       TEXT NOT NULL,              -- relative to uploads/
    kind       TEXT NOT NULL,              -- original | reopen | verdict | repair | verification
    created_at TEXT NOT NULL
);

-- SimilarDefectAgent output: why two cases are related.
CREATE TABLE IF NOT EXISTS case_links (
    case_id         TEXT NOT NULL REFERENCES cases(case_id),
    related_case_id TEXT NOT NULL REFERENCES cases(case_id),
    reason          TEXT NOT NULL,         -- e.g. "Same stack A-08, 1 floor below"
    created_at      TEXT NOT NULL,
    PRIMARY KEY (case_id, related_case_id)
);

-- VerificationAgent: one row per repair attempt (a reopened case gets a new row).
CREATE TABLE IF NOT EXISTS verifications (
    verification_id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id         TEXT NOT NULL REFERENCES cases(case_id),
    guide           TEXT NOT NULL,         -- JSON {intro, steps[], if_fails}
    result          TEXT,                  -- FIXED | NOT_FIXED | CANNOT_VERIFY (NULL = waiting)
    note            TEXT,
    requested_at    TEXT NOT NULL,
    completed_at    TEXT
);

CREATE TABLE IF NOT EXISTS case_events (
    event_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id    TEXT REFERENCES cases(case_id),
    type       TEXT NOT NULL,              -- see CONTRACTS.md §3
    agent      TEXT,                       -- set for agent.step
    message    TEXT,
    payload    TEXT,                       -- JSON
    created_at TEXT NOT NULL
);

-- CommsAgent in-app updates (emails go to outbox).
CREATE TABLE IF NOT EXISTS buyer_messages (
    message_id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id    TEXT NOT NULL REFERENCES cases(case_id),
    title      TEXT NOT NULL,
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- RecurrenceAgent: a recurring/clustered defect as a business-level object.
CREATE TABLE IF NOT EXISTS systemic_issues (
    systemic_issue_id  TEXT PRIMARY KEY,   -- SI-001
    title              TEXT NOT NULL,
    category           TEXT NOT NULL,
    block              TEXT NOT NULL,
    stack              TEXT NOT NULL,
    recurrence_count   INTEGER NOT NULL,
    reopened_count     INTEGER NOT NULL DEFAULT 0,
    confidence         REAL,               -- 0..1
    status             TEXT NOT NULL DEFAULT 'open',      -- open | under_inspection | monitoring | resolved
    approval_status    TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
    recommended_action TEXT,
    detected_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS systemic_issue_cases (
    systemic_issue_id TEXT NOT NULL REFERENCES systemic_issues(systemic_issue_id),
    case_id           TEXT NOT NULL REFERENCES cases(case_id),
    PRIMARY KEY (systemic_issue_id, case_id)
);

CREATE TABLE IF NOT EXISTS approvals (
    approval_id       TEXT PRIMARY KEY,
    case_id           TEXT NOT NULL REFERENCES cases(case_id),
    systemic_issue_id TEXT REFERENCES systemic_issues(systemic_issue_id),
    reasons           TEXT,                -- JSON array
    status            TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
    decided_by        TEXT,
    created_at        TEXT NOT NULL,
    decided_at        TEXT
);

CREATE TABLE IF NOT EXISTS inspection_briefs (
    case_id    TEXT PRIMARY KEY REFERENCES cases(case_id),
    brief      TEXT NOT NULL,              -- JSON {timeline, photo_comparison, neighbouring_units, likely_components, checklist}
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

CREATE INDEX IF NOT EXISTS idx_cases_unit     ON cases(unit_id);
CREATE INDEX IF NOT EXISTS idx_cases_status   ON cases(status);
CREATE INDEX IF NOT EXISTS idx_events_case    ON case_events(case_id);
CREATE INDEX IF NOT EXISTS idx_links_related  ON case_links(related_case_id);
CREATE INDEX IF NOT EXISTS idx_verif_case     ON verifications(case_id);
CREATE INDEX IF NOT EXISTS idx_messages_case  ON buyer_messages(case_id);
