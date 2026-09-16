# ThermaSpace

**A Web-Based Interactive Cooling Load Estimation System for HVAC Engineers in Sri Lanka**

This repository is the static GitHub Pages edition of ThermaSpace.

## Architecture

The public website is intentionally browser-only:

**GitHub Pages → bundled CLTD/SCL/CLF lookup tables → browser calculations → downloadable result workbook**

There is no runtime dependency on Google Colab, MySQL, Apps Script, OAuth, or a private API.

The lookup tables are stored in `data/tables/` and compiled into
`data/thermaspace-db.js`. Because that file is loaded as a normal script, the
website does not make a database `fetch()` call and avoids the earlier
`Failed to fetch` problem.

## Public site

After GitHub Pages is enabled for this repository, the expected URL is:

`https://susara20010420.github.io/ThermaSpace/`

## Repository files

- `index.html` — application interface
- `styles.css` — light responsive design
- `app.js` — cooling-load calculation engine and report export
- `data/thermaspace-db.js` — runtime lookup bundle
- `data/thermaspace-db.json` — JSON copy of lookup data
- `data/tables/*.csv` — individual editable lookup tables
- `data/source/ThermaSpace_CLTD_Database.xlsx` — source workbook
- `tools/build_data.py` — rebuilds the runtime bundle from CSV tables
- `tools/ThermaSpace_GitHub_Data_Builder.ipynb` — optional Colab helper
- `.github/workflows/pages.yml` — automatic GitHub Pages deployment

## Important limitation

A public static GitHub Pages website cannot silently write files into a private
Google Drive folder without authentication or a backend. ThermaSpace therefore
downloads the result as an Excel workbook. The user can save/upload that file
to Drive.

This makes the public calculator independent of your Colab session and keeps
the site available even when Colab is stopped.
