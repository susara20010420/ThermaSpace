# GitHub setup for your ThermaSpace repository

Repository:

`https://github.com/susara20010420/ThermaSpace`

## 1. Upload the files

Upload the **contents** of this folder to the root of your repository.

The repository root should look like:

```text
ThermaSpace/
├── index.html
├── styles.css
├── app.js
├── README.md
├── .nojekyll
├── data/
│   ├── thermaspace-db.js
│   ├── thermaspace-db.json
│   ├── README.md
│   ├── source/
│   │   └── ThermaSpace_CLTD_Database.xlsx
│   └── tables/
│       ├── config.csv
│       ├── roof_types.csv
│       ├── roof_cltd.csv
│       ├── wall_types.csv
│       ├── wall_cltd.csv
│       ├── glass_cltd.csv
│       ├── scl.csv
│       ├── clf_occupancy.csv
│       └── clf_lighting.csv
├── tools/
│   ├── build_data.py
│   └── ThermaSpace_GitHub_Data_Builder.ipynb
└── .github/
    └── workflows/
        └── pages.yml
```

## 2. Enable GitHub Pages

In your GitHub repository:

1. Open **Settings**.
2. Open **Pages**.
3. Under **Build and deployment**, choose **GitHub Actions** as the source.
4. Return to the **Actions** tab.
5. Wait for **Deploy ThermaSpace to GitHub Pages** to complete.

Your public site should then be:

`https://susara20010420.github.io/ThermaSpace/`

## 3. Updating lookup tables

Edit the CSV files under `data/tables/`.

Then regenerate the browser lookup bundle:

```bash
python tools/build_data.py
```

Commit the changed CSV file(s), `data/thermaspace-db.js`, and
`data/thermaspace-db.json`.

If you prefer Colab, upload/copy the repository folder into Google Drive and
run `tools/ThermaSpace_GitHub_Data_Builder.ipynb`.

## 4. Why Colab is not the public backend

If the GitHub website calls a Colab backend, the public site stops working when
the Colab runtime sleeps or its temporary URL changes. The GitHub Pages version
therefore performs the calculation in the browser. Colab is only an optional
data-maintenance tool.

## 5. Results

The website can:

- calculate the 24-hour profile,
- find the peak load,
- show kW, TR and Btu/h,
- calculate required supply airflow,
- download hourly CSV,
- create a multi-sheet Excel result workbook,
- print/save the final report as PDF.

Automatic writing to a private Google Drive folder is deliberately not used,
because that would require authentication or a persistent backend.
