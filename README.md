# ThermaSpace lookup data

The public website uses `thermaspace-db.js` at runtime. It is loaded as a normal
JavaScript file, so the website does not call a backend and does not use `fetch()`
for the lookup database.

The human-readable lookup tables are in `data/tables/`:

- `roof_types.csv`
- `roof_cltd.csv`
- `wall_types.csv`
- `wall_cltd.csv`
- `glass_cltd.csv`
- `scl.csv`
- `clf_occupancy.csv`
- `clf_lighting.csv`
- `config.csv`

`data/source/ThermaSpace_CLTD_Database.xlsx` is included as the source workbook.

After editing any CSV table, run:

```bash
python tools/build_data.py
```

This regenerates both `data/thermaspace-db.json` and
`data/thermaspace-db.js`.

Important: the West-wall hour-19 CLTD value is preserved exactly from the
supplied Sri Lanka-adjusted table. Verify it against the original source before
claiming final engineering validation.
