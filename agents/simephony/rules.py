"""Loads rules.yaml from the repo root (path relative to this module, not cwd)."""
from pathlib import Path
import yaml

RULES_PATH = Path(__file__).resolve().parent.parent.parent / "rules.yaml"


def load_rules() -> dict:
    with open(RULES_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}
