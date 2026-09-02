Open Data Visualiser makes quick sense of messy public datasets. You paste a URL or drop in a file, and it outputs a usable chart without making you clean the data first.

Public data is usually a mess. Files come in CSV, Excel, or JSON formats, packed with weird headers, mixed data types, and unexpected formatting. Open Data Visualiser skips the spreadsheet pre-cleaning step entirely.

### Core Capabilities

* **Flexible Import:** Drop in a file, paste a link, or load a built-in demo dataset. If a site blocks direct links, the app retries through a CORS proxy to get the file anyway.
* **Automatic Cleaning:** It strips currency symbols, handles negative numbers in parentheses, ignores top-row metadata, and cleans up broken column names on import.
* **Smart Type Detection:** Each column is scanned and categorized as a number, date, category, boolean, text, or unknown.
* **Auto-Charting:** The app picks a chart based on the data structure. You get line charts for time series, scatter plots for paired metrics, and bar or doughnut charts for categories.
* **Manual Overrides:** If the automatic pick misses, you can manually switch chart types, change axes, select metrics, toggle log scales, or reassign column types.
* **Data Preview:** A quick summary shows row counts, detected column types, and a preview of the raw input before you work with the chart.
* **Image Export:** Save finished charts as PNG or SVG files for reports and slides.

The app handles the messy middle of open data. It lets you check file quality, spot basic trends, and pull out useful visuals in seconds without opening a spreadsheet or writing a script.