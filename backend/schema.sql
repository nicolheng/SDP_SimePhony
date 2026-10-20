-- SimePhony database schema
-- Covers all 15 tables for multi-agent defect management, history, vector search, approvals, and communication.

CREATE TABLE IF NOT EXISTS units (
    unit_id     TEXT PRIMARY KEY,          -- e.g. A-12-08 or A-1-08
    block       TEXT NOT NULL,             -- e.g. A, B, C
    floor       INTEGER NOT NULL,          -- e.g. 12
    stack       TEXT NOT NULL,             -- e.g. 08
    contractor  TEXT                       -- e.g. Pembinaan Jaya
);

CREATE TABLE IF NOT EXISTS buyers (
    buyer_id    TEXT PRIMARY KEY,          -- e.g. B-0001
    name        TEXT NOT NULL,
    email       TEXT NOT NULL,
    unit_id     TEXT REFERENCES units(unit_id)
);

CREATE TABLE IF NOT EXISTS technicians (
    technician_id TEXT PRIMARY KEY,        -- e.g. T-PLUMB-1
    name          TEXT NOT NULL,
    email         TEXT NOT NULL,
    skills        TEXT NOT NULL,           -- JSON array of skills (e.g. ["plumbing", "civil"])
    blocks        TEXT NOT NULL            -- JSON array of covered blocks (e.g. ["A", "B"])
);

CREATE TABLE IF NOT EXISTS slots (
    slot_id       TEXT PRIMARY KEY,        -- e.g. S-1
    technician_id TEXT NOT NULL REFERENCES technicians(technician_id),
    start_at      TEXT NOT NULL,           -- ISO 8601
    end_at        TEXT NOT NULL,           -- ISO 8601
    case_id       TEXT REFERENCES cases(case_id),   -- NULL = free slot
    kind          TEXT                              -- visit | repair
);

CREATE TABLE IF NOT EXISTS cases (
    case_id              TEXT PRIMARY KEY,          -- e.g. C-0001 or H-0001
    unit_id              TEXT NOT NULL REFERENCES units(unit_id),
    buyer_id             TEXT NOT NULL REFERENCES buyers(buyer_id),
    status               TEXT NOT NULL DEFAULT 'SUBMITTED', -- SUBMITTED, INFO_NEEDED, ASSIGNED, VISIT_SCHEDULED, VALID, INVALID, REPAIR_BOOKED, REPAIRED, PENDING_SIGNOFF, CLOSED, REOPENED, ESCALATION_PENDING, EXTRA_INSPECTION
    category             TEXT,                      -- water_leak, electrical, wall_crack, tiles, paint, etc.
    sub_category         TEXT,                      -- ceiling_leak, pipe_burst, tripping_breaker, etc.
    location_in_unit     TEXT,                      -- master bedroom ceiling, kitchen, etc.
    summary              TEXT,                      -- short 1-line summary
    description          TEXT,                      -- original complaint description submitted by resident
    urgency              TEXT,                      -- high, normal, low
    missing_info         TEXT,                      -- JSON array of what IntakeAgent still needs
    follow_up_question   TEXT,                      -- question IntakeAgent asks the buyer
    occurrence_count     INTEGER NOT NULL DEFAULT 1,-- reports of this defect in this unit
    preferred_visit_at   TEXT,                      -- ISO 8601 visit time the buyer picked when reporting
    assignment_attempts INTEGER DEFAULT 0,          -- number of technician assignment attempts
    booking_status       TEXT,                      -- nullable booking negotiation status
    triage_reason        TEXT,                      -- why TriageAgent picked this technician and slot
    verdict_note         TEXT,                      -- technician's reason for VALID / INVALID
    verdict_at           TEXT,                      -- ISO 8601 time of verdict
    repair_note          TEXT,                      -- what technician fixed
    repaired_at          TEXT,                      -- ISO 8601 time marked REPAIRED
    technician_id        TEXT REFERENCES technicians(technician_id),
    reopen_count         INTEGER NOT NULL DEFAULT 0,
    developer_signed     INTEGER NOT NULL DEFAULT 0,
    buyer_signed         INTEGER NOT NULL DEFAULT 0,
    buyer_signed_at      TEXT,                      -- ISO 8601 time of buyer sign-off
    buyer_signoff_note   TEXT,                      -- buyer comment at sign-off
    developer_signed_at  TEXT,                      -- ISO 8601 time of developer sign-off
    developer_signed_by  TEXT,                      -- name of SDP staff who signed
    verification_status  TEXT DEFAULT 'pending',    -- pending, verified, not_verified
    inspection_outcome   TEXT,                      -- VALID_DEFECT, NOT_A_DEFECT, DUPLICATE, etc.
    created_at           TEXT NOT NULL,             -- ISO 8601 creation timestamp
    closed_at            TEXT                       -- ISO 8601 resolution timestamp
);

CREATE TABLE IF NOT EXISTS assignment_history (
    assignment_id   TEXT PRIMARY KEY,
    case_id         TEXT REFERENCES cases(case_id),
    technician_id   TEXT REFERENCES technicians(technician_id),
    slot_id         TEXT REFERENCES slots(slot_id),
    outcome         TEXT NOT NULL,                   -- ACCEPTED | REJECTED
    rejected_reason TEXT,
    created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS case_photos (
    photo_id   TEXT PRIMARY KEY,             -- e.g. CP-0001
    case_id    TEXT NOT NULL REFERENCES cases(case_id),
    path       TEXT NOT NULL,              -- path relative to uploads/
    kind       TEXT NOT NULL,              -- original | reopen | verdict
    created_at TEXT NOT NULL               -- ISO 8601
);

CREATE TABLE IF NOT EXISTS case_events (
    event_id   TEXT PRIMARY KEY,             -- e.g. CE-0001
    case_id    TEXT REFERENCES cases(case_id),
    type       TEXT NOT NULL,              -- case.created, case.info_needed, case.assigned, etc.
    payload    TEXT,                       -- JSON payload
    created_at TEXT NOT NULL               -- ISO 8601
);

CREATE TABLE IF NOT EXISTS approvals (
    approval_id TEXT PRIMARY KEY,          -- e.g. APR-B1C2D3E4
    case_id     TEXT NOT NULL REFERENCES cases(case_id),
    reasons     TEXT,                      -- JSON array of reasons generated by RecurrenceAgent
    status      TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected
    decided_by  TEXT,                      -- name/email of SDP staff member
    created_at  TEXT NOT NULL,             -- ISO 8601
    decided_at  TEXT                       -- ISO 8601
);

CREATE TABLE IF NOT EXISTS inspection_briefs (
    case_id    TEXT PRIMARY KEY REFERENCES cases(case_id),
    brief      TEXT NOT NULL,              -- markdown / JSON produced by InitialInspectionAgent
    created_at TEXT NOT NULL               -- ISO 8601
);

CREATE TABLE IF NOT EXISTS case_embeddings (
    case_id   TEXT PRIMARY KEY REFERENCES cases(case_id),
    model     TEXT NOT NULL,               -- e.g. all-MiniLM-L6-v2
    vector    BLOB NOT NULL                -- raw float32 numpy bytes (384 dims)
);

CREATE TABLE IF NOT EXISTS outbox (
    email_id   TEXT PRIMARY KEY,             -- e.g. OB-0001
    case_id    TEXT REFERENCES cases(case_id),
    to_addr    TEXT NOT NULL,
    subject    TEXT NOT NULL,
    body       TEXT NOT NULL,
    status     TEXT NOT NULL,              -- sent | logged, not sent
    error      TEXT,
    created_at TEXT NOT NULL               -- ISO 8601
);

CREATE TABLE IF NOT EXISTS systemic_issues (
    issue_id           TEXT PRIMARY KEY,   -- e.g. SI-001
    title              TEXT NOT NULL,      -- short name shown on systemic issues page
    category           TEXT NOT NULL,      -- water_leak, electrical, tiles, etc.
    block              TEXT,               -- affected block
    stack              TEXT,               -- affected vertical stack
    related_cases      TEXT NOT NULL,      -- JSON array of case IDs linked to this issue
    recurrence_count   INTEGER NOT NULL DEFAULT 0,
    reopened_count     INTEGER NOT NULL DEFAULT 0,
    confidence         REAL,               -- AI detection confidence score (0.0 to 1.0)
    detected_at        TEXT NOT NULL,      -- ISO 8601
    status             TEXT NOT NULL DEFAULT 'open', -- open, under_inspection, monitoring, resolved
    recommended_action TEXT,               -- AI proposed action
    approval_id        TEXT REFERENCES approvals(approval_id)
);

CREATE TABLE IF NOT EXISTS verifications (
    verification_id TEXT PRIMARY KEY,      -- e.g. V-0001
    case_id         TEXT NOT NULL REFERENCES cases(case_id),
    protocol        TEXT,                  -- predefined test steps retrieved by VerificationAgent
    outcome         TEXT,                  -- FIXED, NOT_FIXED, CANNOT_VERIFY (NULL = waiting)
    evidence_notes  TEXT,                  -- resident confirmation or rejection comments
    photo_path      TEXT,                  -- path to resident verification proof photo
    created_at      TEXT NOT NULL,         -- ISO 8601 time guide was issued
    completed_at    TEXT                   -- ISO 8601 time buyer submitted result (NULL = waiting)
);

CREATE TABLE IF NOT EXISTS case_links (
    case_id         TEXT NOT NULL REFERENCES cases(case_id),
    related_case_id TEXT NOT NULL REFERENCES cases(case_id),
    reason          TEXT NOT NULL,         -- why related (e.g. "Same stack A-08, 1 floor below")
    score           REAL,                  -- similarity score from embedding search (0.0 to 1.0)
    created_at      TEXT NOT NULL          -- ISO 8601
);

CREATE TABLE IF NOT EXISTS buyer_messages (
    message_id  TEXT PRIMARY KEY,            -- e.g. BM-0001
    case_id     TEXT NOT NULL REFERENCES cases(case_id),
    title       TEXT NOT NULL,             -- short headline
    body        TEXT NOT NULL,             -- message text within guardrails
    created_at  TEXT NOT NULL              -- ISO 8601
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cases_unit           ON cases(unit_id);
CREATE INDEX IF NOT EXISTS idx_cases_status         ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_buyer          ON cases(buyer_id);
CREATE INDEX IF NOT EXISTS idx_events_case          ON case_events(case_id);
CREATE INDEX IF NOT EXISTS idx_assignment_history_case ON assignment_history(case_id);
CREATE INDEX IF NOT EXISTS idx_si_status            ON systemic_issues(status);
CREATE INDEX IF NOT EXISTS idx_si_block             ON systemic_issues(block, stack);
CREATE INDEX IF NOT EXISTS idx_verifications_case   ON verifications(case_id);
CREATE INDEX IF NOT EXISTS idx_case_links_case      ON case_links(case_id);
CREATE INDEX IF NOT EXISTS idx_buyer_messages_case  ON buyer_messages(case_id);
