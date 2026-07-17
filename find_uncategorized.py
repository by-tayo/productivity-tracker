"""Lists app names that have shown up in your activity log but aren't in
categories.json yet, so you can add them. Run: python find_uncategorized.py"""
import json
from pathlib import Path

from tracker import storage

BASE_DIR = Path(__file__).resolve().parent
CATEGORIES_PATH = BASE_DIR / "categories.json"

with open(CATEGORIES_PATH, "r", encoding="utf-8") as f:
    known = {name.lower() for name in json.load(f)}

with storage.get_conn() as conn:
    rows = conn.execute(
        "SELECT DISTINCT app_name FROM sessions WHERE is_idle = 0 ORDER BY app_name"
    ).fetchall()

missing = [row[0] for row in rows if row[0].lower() not in known]

if not missing:
    print("Every app you've used so far is already categorized.")
else:
    print("Not yet in categories.json:")
    for name in missing:
        print(f"  {name}")
