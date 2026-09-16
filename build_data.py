#!/usr/bin/env python3
"""Build ThermaSpace runtime lookup bundles from the CSV tables.

No server or database is required at runtime. The generated JS bundle is loaded
directly by GitHub Pages.
"""
from pathlib import Path
import csv
import json

ROOT = Path(__file__).resolve().parents[1]
TABLE_DIR = ROOT / "data" / "tables"

FILES = {
    "Config": "config.csv",
    "Roof_Types": "roof_types.csv",
    "Roof_CLTD": "roof_cltd.csv",
    "Wall_Types": "wall_types.csv",
    "Wall_CLTD": "wall_cltd.csv",
    "Glass_CLTD": "glass_cltd.csv",
    "SCL": "scl.csv",
    "CLF_Occupancy": "clf_occupancy.csv",
    "CLF_Lighting": "clf_lighting.csv",
}

def scalar(v):
    s = (v or "").strip()
    if s == "":
        return ""
    try:
        if any(ch in s.lower() for ch in (".", "e")):
            return float(s)
        return int(s)
    except ValueError:
        return s

def read_csv(path):
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        return [{k: scalar(v) for k, v in row.items()} for row in csv.DictReader(f)]

sheets = {}
for sheet, filename in FILES.items():
    path = TABLE_DIR / filename
    if not path.exists():
        raise FileNotFoundError(f"Missing lookup table: {path}")
    sheets[sheet] = read_csv(path)

required = ["Config","Roof_Types","Roof_CLTD","Wall_Types","Wall_CLTD",
            "Glass_CLTD","SCL","CLF_Occupancy","CLF_Lighting"]
missing = [s for s in required if not sheets.get(s)]
if missing:
    raise RuntimeError("Empty lookup table(s): " + ", ".join(missing))

payload = {
    "meta": {
        "name": "ThermaSpace CLTD Database",
        "generated_from": "data/tables/*.csv",
        "basis": "User-supplied Sri Lanka adjusted CLTD/SCL/CLF tables",
        "warning": "West wall hour 19 value is preserved exactly as supplied and should be verified."
    },
    "sheets": sheets
}

json_path = ROOT / "data" / "thermaspace-db.json"
js_path = ROOT / "data" / "thermaspace-db.js"

json_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
js_path.write_text(
    "/* Auto-generated ThermaSpace lookup database. */\n"
    "window.THERMASPACE_DB = " +
    json.dumps(payload, ensure_ascii=False, separators=(",", ":")) +
    ";\n",
    encoding="utf-8"
)

print("Built:")
print(" -", json_path)
print(" -", js_path)
print("Roof CLTD rows:", len(sheets["Roof_CLTD"]))
print("Wall CLTD rows:", len(sheets["Wall_CLTD"]))
print("SCL rows:", len(sheets["SCL"]))
