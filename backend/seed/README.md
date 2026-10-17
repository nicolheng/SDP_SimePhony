# Seed Scripts

## What commands to run

### 1. If you edit the seed scripts, regenerate the database:
```bash
# Runs everything (core units + 18-month history + vector embeddings)
python backend/seed/seed_history.py
```
*(Then click the **Refresh** button in your VS Code SQLite Viewer tab).*

---

### 2. If you just pulled from Git:
Sync the updated `seed.db` to your local live database:

```bash
# Git Bash:
cp data/seed.db data/simephony.db

# Windows PowerShell:
copy data\seed.db data\simephony.db
```

---

## Script Breakdown
- `seed_core.py` (P3) — 450 units, 450 buyers, 6 technicians, 2 weeks of slots.
- `seed_history.py` (P4) — 18-month defect history, planted story (A-12-08 & stack 08 leaks), all 13 tables, and sentence-transformers vector embeddings.

