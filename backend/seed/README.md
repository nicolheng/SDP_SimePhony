# Seed scripts

Both scripts write into `data/seed.db` (committed). The live DB `data/simephony.db` is copied from it.

- `seed_core.py` (P3) — units, buyers (with emails), technicians (skills, block coverage, emails), 2 weeks of slots.
- `seed_history.py` (P4) — 18 months of defect history with realistic noise, plus the planted story:
  A-12-08 with 2 past leaks; A-12-07, A-11-08, A-10-08, A-9-08 with leak history.
  Also generates sentence-transformers embeddings into `case_embeddings`.
