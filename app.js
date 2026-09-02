const LIMIT = 1000,
  CORS_PROXIES = [
    "https://api.allorigins.win/raw?url=",
    "https://corsproxy.io/?url=",
  ],
  PALETTE = [
    "#268bd2",
    "#2aa198",
    "#859900",
    "#b58900",
    "#cb4b16",
    "#dc322f",
    "#d33682",
    "#6c71c4",
  ];
Chart.defaults.color = "#657b83";
Chart.defaults.font.family = "SFMono-Regular, Consolas, Liberation Mono, monospace";
Chart.defaults.plugins.tooltip.backgroundColor = "#eee8d5";
Chart.defaults.plugins.tooltip.titleColor = "#586e75";
Chart.defaults.plugins.tooltip.bodyColor = "#586e75";
const state = { rows: [], columns: [], chart: null, source: "Awaiting source", colorOffset: 0 };
const $ = (id) => document.getElementById(id);
const chartColor = (index = 0) => PALETTE[(state.colorOffset + index) % PALETTE.length];
const chartPalette = () => PALETTE.map((_, index) => chartColor(index));
const el = Object.fromEntries(
  [
    "datasetUrl",
    "fileInput",
    "uploadButton",
    "loadButton",
    "status",
    "rowCount",
    "columnList",
    "metadata",
    "preview",
    "previewState",
    "chartType",
    "xColumn",
    "yColumn",
    "maxEntries",
    "maxEntriesValue",
    "logScale",
    "logScaleHint",
    "renderButton",
    "chartArea",
    "appShell",
    "exports",
    "exportPngButton",
  ].map((id) => [id, $(id)]),
);
const blank = (v) =>
  v === null ||
  v === undefined ||
  [
    "",
    "blank",
    "empty",
    "(blank)",
    "(empty)",
    "null",
    "n/a",
    "na",
    "undefined",
    "nil",
    "none",
    "not applicable",
  ].includes(String(v).trim().toLowerCase());
const num = (v) => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v instanceof Date) return null;
  if (typeof v !== "string" && typeof v !== "number") return null;
  let s = String(v).trim();
  if (!s || ["nan", "infinity", "-infinity", "+infinity"].includes(s.toLowerCase())) return null;
  let parenMatch = s.match(/^\(([^\)]+)\)$/);
  let negative = false;
  if (parenMatch) {
    negative = true;
    s = parenMatch[1].trim();
  }
  let cleaned = s.replace(/[$€£¥₹,\s%]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === "+") return null;
  let val = Number(cleaned);
  if (!Number.isFinite(val)) return null;
  return negative ? -val : val;
};
const bool = (v) =>
  ["true", "false", "yes", "no", "0", "1"].includes(String(v).trim().toLowerCase());
const date = (v) => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "number") {
    if (v >= 1800 && v <= 2200 && Number.isInteger(v)) return new Date(Date.UTC(v, 0, 1));
    return null;
  }
  if (typeof v !== "string") return null;
  let text = v.trim();
  if (!text) return null;
  let year = text.match(/^(\d{4})(?:\s+total)?$/i);
  if (year && Number(year[1]) >= 1800 && Number(year[1]) <= 2200)
    return new Date(Date.UTC(Number(year[1]), 0, 1));
  let q1 = text.match(/^(?:Q([1-4])|([1-4])Q)[\s/-]*(\d{4})$/i);
  if (q1) {
    let q = Number(q1[1] || q1[2]),
      y = Number(q1[3]);
    if (y >= 1800 && y <= 2200) return new Date(Date.UTC(y, (q - 1) * 3, 1));
  }
  let q2 = text.match(/^(\d{4})[\s/-]*(?:Q([1-4])|([1-4])Q)$/i);
  if (q2) {
    let y = Number(q2[1]),
      q = Number(q2[2] || q2[3]);
    if (y >= 1800 && y <= 2200) return new Date(Date.UTC(y, (q - 1) * 3, 1));
  }
  if (/^[-+]?\d+(\.\d+)?$/.test(text)) return null;
  let d = Date.parse(text);
  if (!Number.isNaN(d)) return new Date(d);
  let my = text.match(/^([a-zA-Z]{3,9})[\s/-]+(\d{2,4})$/);
  if (my) {
    let mStr = my[1],
      yStr = my[2],
      y = yStr.length === 2 ? Number(`20${yStr}`) : Number(yStr),
      parsed = Date.parse(`${mStr} 1, ${y}`);
    if (!Number.isNaN(parsed)) return new Date(parsed);
  }
  return null;
};
const show = (v) =>
  blank(v) ? "(empty)" : v instanceof Date ? v.toISOString().split("T")[0] : String(v);
function status(message, warning = false) {
  el.status.textContent = message;
  el.status.classList.toggle("warning", warning);
}
function flatten(row) {
  return Object.fromEntries(
    Object.entries(row || {}).flatMap(([k, v]) =>
      v && typeof v === "object" && !Array.isArray(v)
        ? Object.entries(v).map(([ck, cv]) => [`${k}_${ck}`, cv])
        : [[k, v]],
    ),
  );
}
function schema(rows) {
  return [...new Set(rows.flatMap(Object.keys))].map((key) => {
    let values = rows.map((r) => r[key]).filter((v) => !blank(v)),
      unique = new Set(values.map((v) => (v instanceof Date ? v.toISOString() : String(v)))),
      ratio = (fn) => values.filter(fn).length / Math.max(values.length, 1),
      dateRatio = ratio((v) => !!date(v)),
      namedDate = /(year|date|period|time|month|quarter)/i.test(key),
      type = !values.length
        ? "unknown"
        : ratio(bool) > 0.9
          ? "boolean"
          : dateRatio > 0.8 || (namedDate && dateRatio > 0.5)
            ? "datetime"
            : ratio((v) => num(v) !== null) > 0.9
              ? "numeric"
              : unique.size / values.length > 0.8
                ? "text"
                : "categorical";
    return { key, type, unique: unique.size, nulls: rows.length - values.length };
  });
}
const idLike = (key) =>
  /^(id|year|code|index|abn|acn|postcode|zip|zip\s*code|phone|fax|rank|ranking|row|row_num|gid|gisid|objectid)$/i.test(
    String(key).trim(),
  ) || /(_id|_code|_no|_num)$/i.test(String(key).trim());
const geoCoordLike = (key) =>
  /^(lat|latitude|northing|y)$/i.test(String(key).trim()) ||
  /^(lon|long|longitude|easting|x)$/i.test(String(key).trim());
function pickMetric(n) {
  return [...n]
    .sort((a, b) => metricScore(b.key) - metricScore(a.key))[0]
    .key;
}
const metricScore = (key) =>
  /(value|amount|count|total|mass|weight|height|width|length|depth|area|elevation|population|pop|life|gdp|income|temperature|rate|score|index|budget|expenditure)/i.test(
    String(key),
  )
    ? 1
    : 0;
function guess(c) {
  let dCols = c.filter((x) => x.type === "datetime"),
    d = dCols.find((x) => x.unique >= 4) || dCols.find((x) => x.key === "period" && x.unique > 1),
    n = c.filter((x) => x.type === "numeric" && !idLike(x.key)),
    metrics = n.filter((col) => !geoCoordLike(col.key)),
    cat = c.filter((x) => x.type === "categorical" || x.type === "boolean" || x.type === "text"),
    latCol =
      c.find((x) => /^(lat|latitude)$/i.test(x.key)) || c.find((x) => /^(northing)$/i.test(x.key)),
    lonCol =
      c.find((x) => /^(lon|long|longitude)$/i.test(x.key)) ||
      c.find((x) => /^(easting)$/i.test(x.key));
  if (latCol && lonCol && latCol.unique > 1 && lonCol.unique > 1)
    return { type: "scatter", x: lonCol.key, y: [latCol.key] };
  if (d && metrics.length) {
    return {
      type: "line",
      x: d.key,
      y:
        d.key === "period" && metrics.length > 1 && metrics.length <= 8
          ? metrics.map((col) => col.key)
          : [pickMetric(metrics)],
    };
  }
  if (metrics.length >= 2) {
    let x = pickMetric(metrics),
      y = pickMetric(metrics.filter((column) => column.key !== x));
    return { type: "scatter", x, y: [y] };
  }
  if (cat.length && metrics.length) {
    let bestCat =
      cat.find((col) => !idLike(col.key) && col.unique >= 2 && col.unique <= 50) || cat[0];
    return {
      type: bestCat.unique <= 6 ? "doughnut" : "bar",
      x: bestCat.key,
      y: [pickMetric(metrics)],
    };
  }
  if (n.length >= 2) return { type: "scatter", x: n[0].key, y: [n[1].key] };
  return {
    type: "bar",
    x: (cat.sort((a, b) => b.unique - a.unique)[0] || c[0]).key,
    y: n.length ? [pickMetric(n)] : ["__count__"],
  };
}
function opt(label, value, selected) {
  let o = document.createElement("option");
  o.textContent = label;
  o.value = value;
  o.selected = selected;
  o.title = label;
  return o;
}
function controls(config) {
  for (let s of [el.xColumn, el.yColumn]) s.replaceChildren();
  el.xColumn.append(
    ...state.columns.map((c) => opt(`${c.key} (${c.type})`, c.key, c.key === config.x)),
  );
  el.yColumn.append(
    opt("Count of rows", "__count__", config.y.includes("__count__")),
    ...state.columns
      .filter((c) => c.type === "numeric" || c.type === "datetime")
      .map((c) => opt(`${c.key} (${c.type})`, c.key, config.y.includes(c.key))),
  );
  el.chartType.value = config.type;
  [el.chartType, el.xColumn, el.yColumn, el.renderButton].forEach((x) => (x.disabled = false));
}
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
  MONTHS = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
function calendarIndex(label, names) {
  let value = String(label).trim().toLowerCase().replace(/\.$/, ""),
    index = names.findIndex((name) => value === name || value === name.slice(0, 3));
  return index < 0 ? null : index;
}
function calendarOrder(entries, x) {
  let labels = entries.map(([label]) => label),
    days = labels.map((label) => calendarIndex(label, DAYS));
  if (days.every((index) => index !== null)) return days;
  let months = labels.map((label) => calendarIndex(label, MONTHS));
  if (months.every((index) => index !== null)) return months;
  let dates = labels.map((label) => date(label)?.getTime() ?? null),
    dateColumn = state.columns.find((column) => column.key === x)?.type === "datetime";
  return dateColumn || dates.every((value) => value !== null) ? dates : null;
}
const summary = (value) =>
  /^(other|total|grand total|all|sum|average|mean)\b/i.test(String(value).trim());
function aggregate(x, y) {
  let map = new Map();
  for (let row of state.rows) {
    if (blank(row[x]) || summary(row[x])) continue;
    let k = show(row[x]),
      v = y === "__count__" ? 1 : num(row[y]);
    if (v !== null) map.set(k, (map.get(k) || 0) + v);
  }
  let entries = [...map],
    order = calendarOrder(entries, x);
  if (order) {
    entries.sort((first, second) => {
      let firstValue = calendarOrder([first], x)[0] ?? Infinity,
        secondValue = calendarOrder([second], x)[0] ?? Infinity;
      return firstValue - secondValue;
    });
    return entries;
  }
  return entries.sort((a, b) => b[1] - a[1]);
}
function options(x, y, legend = false, radial = false) {
  let postcode = /(post\s*code|zip)/i.test(x),
    xTicks = { maxRotation: 45, minRotation: 0 },
    log = !radial && el.logScale.checked,
    yScale = { title: { display: true, text: y }, grid: { color: "#e3dcc8" } };
  if (postcode) xTicks.callback = (value) => String(value);
  if (log) yScale.type = "logarithmic";
  else yScale.beginAtZero = true;
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: legend, labels: { boxWidth: 12 } },
      tooltip: {
        padding: 10,
        callbacks: postcode ? { title: (items) => `${x}: ${items[0].parsed.x}` } : {},
      },
    },
    scales: radial
      ? {}
      : {
          x: { title: { display: true, text: x }, grid: { color: "#e3dcc8" }, ticks: xTicks },
          y: yScale,
        },
  };
}
function truncateAggregate(entries, maxItems = 10) {
  if (entries.length <= maxItems) return entries;
  let top = entries.slice(0, maxItems),
    restSum = entries.slice(maxItems).reduce((acc, [, value]) => acc + value, 0);
  return [...top, ["Other", restSum]];
}
function groupCount(x) {
  return new Set(
    state.rows
      .map((row) => row[x])
      .filter((v) => !blank(v) && !summary(v))
      .map(show),
  ).size;
}
// Enables/refreshes the "Show top N" and "Log scale" controls for the current selection.
function syncViewOptions(x, ys, type, grouped) {
  let count = grouped ? groupCount(x) : 0,
    key = `${x}:${type}`;
  el.maxEntries.disabled = !grouped || count <= 5;
  if (grouped && count > 5 && el.maxEntries.dataset.key !== key) {
    el.maxEntries.min = 5;
    el.maxEntries.max = count;
    el.maxEntries.value = Math.min(count, 10);
    el.maxEntries.dataset.key = key;
  }
  el.maxEntriesValue.textContent = el.maxEntries.disabled
    ? "All groups"
    : `Top ${el.maxEntries.value} of ${count}`;
  let y = ys.find((k) => k !== "__count__"),
    values = y ? state.rows.map((row) => num(row[y])).filter((v) => v !== null) : [],
    chartSupportsLog = type === "bar" || type === "line" || type === "scatter",
    hasPositiveMetric = values.length > 0 && values.every((v) => v > 0),
    canLog = chartSupportsLog && hasPositiveMetric;
  el.logScale.disabled = !canLog;
  if (!canLog) el.logScale.checked = false;
  el.logScaleHint.textContent = canLog
    ? "Rescales the Y axis to compare small and large values"
    : !chartSupportsLog
      ? `Not available for ${type} charts`
      : !y
        ? "Select a numeric Y metric to enable"
        : "Needs a metric with only positive values";
  el.logScale.title = el.logScaleHint.textContent;
}
function multiSeries(x, ys) {
  let maps = ys.map((y) => new Map(aggregate(x, y))),
    reference = maps.reduce((best, m) => (m.size > best.size ? m : best), new Map()),
    labels = [...reference.keys()],
    seen = new Set(labels);
  for (let m of maps)
    for (let label of m.keys())
      if (!seen.has(label)) {
        labels.push(label);
        seen.add(label);
      }
  return { labels, maps };
}
function chartMessage(title, detail) {
  if (state.chart) {
    state.chart.destroy();
    state.chart = null;
  }
  el.chartArea.innerHTML = `<div class="empty"><div><strong>${title}</strong>${detail}</div></div>`;
  status(title.toUpperCase(), true);
}
function selectedY() {
  return [...el.yColumn.selectedOptions].map((o) => o.value);
}
function selectOnlyY(value) {
  el.yColumn.value = value;
}
function selectScatterAxes() {
  if (!state.rows.length) {
    status("WAITING FOR DATA");
    return;
  }
  let numeric = state.columns.filter((column) => column.type === "numeric");
  if (numeric.length < 2) {
    chartMessage(
      "Scatter needs two numeric columns",
      "Choose a dataset with two numeric fields to plot coordinates.",
    );
    return;
  }
  if (!numeric.some((column) => column.key === el.xColumn.value)) el.xColumn.value = numeric[0].key;
  let ys = selectedY();
  if (
    ys.length !== 1 ||
    !numeric.some((column) => column.key === ys[0]) ||
    ys[0] === el.xColumn.value
  )
    selectOnlyY(numeric.find((column) => column.key !== el.xColumn.value).key);
  render();
}
function render() {
  let type = el.chartType.value,
    x = el.xColumn.value,
    ys = selectedY(),
    xType = state.columns.find((column) => column.key === x)?.type,
    grouped = type !== "scatter" && xType !== "datetime" && xType !== "numeric";
  if (!x || !ys.length || !state.rows.length) return;
  syncViewOptions(x, ys, type, grouped);
  let limit = el.maxEntries.disabled ? Infinity : Number(el.maxEntries.value);
  if (state.chart) {
    state.chart.destroy();
    state.chart = null;
  }
  let data, config;
  if (type === "scatter") {
    let y = ys[0],
      points = state.rows
        .map((row) => ({ x: num(row[x]), y: num(row[y]) }))
        .filter((point) => point.x !== null && point.y !== null);
    if (points.length < 2) {
      chartMessage(
        "Scatter needs two numeric columns",
        "Select two numeric fields with at least two usable values.",
      );
      return;
    }
    data = {
      datasets: [
        {
          label: `${y} by ${x}`,
          data: points,
          backgroundColor: `${chartColor()}99`,
          borderColor: chartColor(),
        },
      ],
    };
    config = options(x, y);
  } else if (type === "treemap") {
    let y = ys[0],
      yLabel = y === "__count__" ? "Count of rows" : y,
      entries = truncateAggregate(aggregate(x, y), limit);
    if (!entries.length) {
      chartMessage(
        "No chartable data",
        "The selected group has no usable values after blank and summary rows are filtered.",
      );
      return;
    }
    if (!entries.some(([, value]) => value > 0)) {
      chartMessage(
        "Treemap needs positive values",
        "Choose a metric with one or more values above zero.",
      );
      return;
    }
    data = {
      datasets: [
        {
          tree: entries.map(([label, value]) => ({ label, value })),
          key: "value",
          groups: ["label"],
          spacing: 1,
          borderWidth: 1,
          borderColor: "#fdf6e3",
          backgroundColor: (context) => chartColor(context.dataIndex),
          labels: {
            display: true,
            align: "center",
            position: "middle",
            color: "#fdf6e3",
            font: { weight: "bold" },
            formatter: (context) => [context.raw.g, context.raw.v.toLocaleString()],
          },
        },
      ],
    };
    config = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: `${yLabel} by ${x}`, color: "#586e75", font: { size: 13, weight: "normal" } },
        legend: { display: false },
        tooltip: {
          callbacks: { label: (context) => `${context.raw.g}: ${context.raw.v.toLocaleString()} (${yLabel})` },
        },
      },
    };
  } else if (type === "doughnut") {
    let y = ys[0],
      entries = truncateAggregate(aggregate(x, y), limit);
    if (!entries.length) {
      chartMessage(
        "No chartable data",
        "The selected group has no usable values after blank and summary rows are filtered.",
      );
      return;
    }
    if (entries.length < 2) {
      chartMessage(
        "Doughnut needs at least two groups",
        "Choose a group with two or more distinct values.",
      );
      return;
    }
    data = {
      labels: entries.map(([label]) => label),
      datasets: [
        {
          label: y === "__count__" ? "Rows" : y,
          data: entries.map(([, value]) => value),
          backgroundColor: chartPalette(),
          borderColor: "#fdf6e3",
          borderWidth: 2,
        },
      ],
    };
    config = options(x, y === "__count__" ? "Count of rows" : y, true, true);
  } else {
    let multi = ys.length > 1,
      labels,
      maps;
    if (!multi && type === "bar" && xType !== "datetime") {
      let entries = truncateAggregate(aggregate(x, ys[0]), limit);
      if (!entries.length) {
        chartMessage(
          "No chartable data",
          "The selected group has no usable values after blank and summary rows are filtered.",
        );
        return;
      }
      labels = entries.map(([label]) => label);
      data = {
        labels,
        datasets: [
          {
            label: ys[0] === "__count__" ? "Rows" : ys[0],
            data: entries.map(([, value]) => value),
            backgroundColor: `${chartColor()}aa`,
            borderColor: chartColor(),
            borderWidth: 1.5,
            tension: 0.25,
            fill: false,
            pointRadius: 3,
          },
        ],
      };
      config = options(x, ys[0] === "__count__" ? "Count of rows" : ys[0], false);
    } else {
      ({ labels, maps } = multiSeries(x, ys));
      if (grouped && limit < labels.length) labels = labels.slice(0, limit);
      if (!labels.length) {
        chartMessage(
          "No chartable data",
          "The selected group has no usable values after blank and summary rows are filtered.",
        );
        return;
      }
      if (type === "line" && labels.length < 2) {
        chartMessage(
          "Line needs at least two values",
          "Choose a group with two or more usable values.",
        );
        return;
      }
      data = {
        labels,
        datasets: ys.map((y, i) => ({
          label: y === "__count__" ? "Rows" : y,
          data: labels.map((label) => maps[i].get(label) ?? null),
          backgroundColor: `${chartColor(i)}aa`,
          borderColor: chartColor(i),
          borderWidth: 1.5,
          tension: 0.25,
          fill: !multi && type === "line",
          pointRadius: 3,
          spanGaps: true,
        })),
      };
      config = options(x, multi ? "Value" : ys[0] === "__count__" ? "Count of rows" : ys[0], multi);
    }
    if (type === "bar" && labels.some((label) => String(label).length > 15)) {
      config.indexAxis = "y";
      [config.scales.x.title.text, config.scales.y.title.text] = [
        config.scales.y.title.text,
        config.scales.x.title.text,
      ];
    }
  }
  let canvas = document.createElement("canvas");
  el.chartArea.replaceChildren(canvas);
  state.chart = new Chart(canvas, { type, data, options: config });
  el.exports.hidden = false;
  status(
    `VIEW: ${type.toUpperCase()} / ${state.rows.length} ROWS${ys.length > 1 && type !== "scatter" ? ` / ${ys.length} SERIES` : ""}`,
  );
}
function display() {
  el.rowCount.textContent = `${state.rows.length.toLocaleString()} rows`;
  el.columnList.replaceChildren(
    ...state.columns.map((c) => {
      let d = document.createElement("div");
      d.className = "column";
      let pct = state.rows.length
        ? Math.round(((state.rows.length - c.nulls) / state.rows.length) * 100)
        : 100;
      d.innerHTML = `<span class="name" title="${c.key}">${c.key}</span><span class="type">${c.type} · ${pct}%</span>`;
      return d;
    }),
  );
  el.metadata.innerHTML = `<span><i data-lucide="table-properties"></i>${state.source}</span><span><i data-lucide="columns-3"></i>${state.columns.length} columns</span>`;
  el.preview.textContent = JSON.stringify(state.rows.slice(0, 4), null, 2);
  el.previewState.textContent = "First 4 rows";
  lucide.createIcons();
}
function loadRows(rows, source, configOverride) {
  let base = rows
      .slice(0, LIMIT)
      .map(flatten)
      .filter((r) => Object.keys(r).length),
    filtered = base.filter(
      (r) => !Object.values(r).some((v) => typeof v === "string" && summary(v)),
    );
  state.rows = filtered.length ? filtered : base;
  if (!state.rows.length) throw Error("No tabular rows were found in this file.");
  state.source = source;
  state.colorOffset = Math.floor(Math.random() * PALETTE.length);
  state.columns = schema(state.rows);
  let config = { ...guess(state.columns), ...configOverride };
  controls(config);
  display();
  render();
}
function download(name, url) {
  let anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
}
function exportPng() {
  if (state.chart) download("odv-chart.png", state.chart.toBase64Image());
}
function findHeader(grid, minCols) {
  return grid.findIndex(
    (row, index) =>
      row.filter((value) => !blank(value)).length >= minCols &&
      (grid[index + 1] || []).filter((value) => !blank(value)).length >= minCols,
  );
}
function pivotWide(header, body) {
  let periodStart = header.findIndex(
      (value, index) => index > 0 && (date(value) !== null || /^\d{4}$/.test(String(value).trim())),
    ),
    labelHeaders = header.slice(0, periodStart),
    labelIndex = labelHeaders.findIndex((value) => /(country|state|region|area|name|location)/i.test(String(value)));
  if (periodStart < 1) periodStart = 1;
  if (labelIndex < 0) labelIndex = periodStart - 1;
  return header
    .slice(periodStart)
    .map((period, index) => {
      let row = { period: /^\d{4}$/.test(String(period)) ? `${period}-01-01` : period };
      for (let series of body) {
        let value = series[index + periodStart],
          label = show(series[labelIndex]);
        if (num(value) !== null && !blank(series[labelIndex])) row[label] = value;
      }
      return row;
    })
    .filter((row) => Object.keys(row).length > 1);
}
const isMetadataRow = (firstCell) => {
  if (blank(firstCell)) return false;
  let str = String(firstCell).trim().toLowerCase();
  return /^(unit|series\s*type|data\s*type|frequency|collection\s*month|series\s*start|series\s*end|no\.?\s*obs|series\s*id|series\s*title|source|notes|metadata)$/i.test(
    str,
  );
};
function worksheetRows(sheet) {
  let grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }).map((row) => {
    while (row.length && blank(row[row.length - 1])) row.pop();
    return row;
  });
  if (!grid.length) return [];
  let headerIndex = findHeader(grid, 2);
  if (headerIndex < 0) headerIndex = findHeader(grid, 1);
  if (headerIndex < 0) return [];
  let header = grid[headerIndex].map((key) => String(key ?? "").trim()),
    next = (grid[headerIndex + 1] || []).map((key) => String(key ?? "").trim()),
    hasSubheader =
      next.filter((value) => !blank(value)).length >= 2 &&
      !next.some((value) => num(value) !== null) &&
      !isMetadataRow(next[0]),
    body = [],
    start = headerIndex + 1 + Number(hasSubheader);
  if (hasSubheader)
    header = Array.from(
      { length: Math.max(header.length, next.length) },
      (_, index) =>
        [header[index], next[index]].filter((value) => !blank(value)).join(" - ") ||
        `Column ${index + 1}`,
    );
  else if (blank(header[0])) header[0] = "Date";
  for (let index = start; index < grid.length; index++) {
    let row = grid[index];
    if (!row.some((value) => !blank(value))) {
      if (body.length && !isMetadataRow(row[0])) break;
      continue;
    }
    if (isMetadataRow(row[0])) continue;
    body.push(row);
  }
  let numericHeaders = header
    .slice(1)
    .filter((value) => num(value) !== null || date(value) !== null).length;
  if (numericHeaders >= 2 && body.length && !header.slice(1).some((h) => String(h).length > 20))
    return pivotWide(header, body);
  return body.map((row) =>
    Object.fromEntries(header.map((key, index) => [show(key).trim(), row[index] ?? ""])),
  );
}
function csvRows(grid) {
  let headerIndex = findHeader(grid, 2);
  if (headerIndex < 0) headerIndex = findHeader(grid, 1);
  if (headerIndex < 0) return [];
  let header = grid[headerIndex].map((key) => String(key ?? "").trim());
  if (blank(header[0])) header[0] = "Date";
  let body = grid
      .slice(headerIndex + 1)
      .filter((row) => row.some((value) => !blank(value)) && !isMetadataRow(row[0])),
    numericHeaders = header
      .slice(1)
      .filter((value) => num(value) !== null || date(value) !== null).length;
  if (numericHeaders >= 2 && body.length && !header.slice(1).some((h) => String(h).length > 20))
    return pivotWide(header, body);
  return body.map((row) =>
    Object.fromEntries(header.map((key, index) => [show(key).trim(), row[index] ?? ""])),
  );
}
function datasetUrl(url) {
  // BOM publishes some legacy HTTP links. Loading them from a deployed HTTPS
  // page is blocked as mixed content even though the same resource is
  // also available securely.
  return /^http:\/\/www\.bom\.gov\.au\//i.test(url)
    ? url.replace(/^http:/i, "https:")
    : url;
}
async function fetchDataset(url) {
  url = datasetUrl(url);
  try {
    let response = await fetch(url);
    if (!response.ok) throw Error(`The source server returned ${response.status}.`);
    return response;
  } catch (error) {
    // A non-CORS error is authoritative (for example, a genuine 404). Only
    // route browser-blocked requests through public read-only proxies.
    if (!(error instanceof TypeError)) throw error;
    let failures = [];
    for (let index = 0; index < CORS_PROXIES.length; index++) {
      status(`RETRYING VIA CORS PROXY ${index + 1}/${CORS_PROXIES.length}...`);
      try {
        let response = await fetch(`${CORS_PROXIES[index]}${encodeURIComponent(url)}`);
        if (response.ok) return response;
        failures.push(`proxy ${index + 1}: HTTP ${response.status}`);
      } catch {
        failures.push(`proxy ${index + 1}: unavailable`);
      }
    }
    throw Error(
      `The source blocked browser access and the temporary CORS relays could not retrieve it (${failures.join(
        "; ",
      )}). Download the file and use Upload instead.`,
    );
  }
}
async function parse(source) {
  let local = source instanceof File,
    response = local ? new Response(source) : await fetchDataset(source),
    path = (local ? source.name : source.split("?")[0]).toLowerCase();
  if (!response.ok) throw Error(`The server returned ${response.status}.`);
  let contentType = response.headers.get("content-type") || "";
  if (/text\/html|application\/xhtml\+xml/i.test(contentType))
    throw Error(
      "This URL returned a web page, not a dataset file. Use the portal's CSV/XLSX download link instead.",
    );
  let xlsxLike = /\.xlsx?$/.test(path);
  if (!xlsxLike && !/\.(csv|txt|json)$/.test(path)) {
    // some servers omit file extensions; sniff the ZIP signature xlsx files start with
    let head = new Uint8Array(await response.clone().arrayBuffer(), 0, 2);
    xlsxLike = head[0] === 0x50 && head[1] === 0x4b;
  }
  if (xlsxLike) {
    let wb = XLSX.read(await response.arrayBuffer(), { type: "array", cellDates: true }),
      sheets = wb.SheetNames.map((name) => worksheetRows(wb.Sheets[name]));
    return (sheets.sort((first, second) => second.length - first.length)[0] || []).slice(0, LIMIT);
  }
  let text = await response.text();
  if (/^\s*(?:<!doctype\s+html|<html[\s>])/i.test(text))
    throw Error(
      "This URL returned a web page, not a dataset file. Use the portal's CSV/XLSX download link instead.",
    );
  if (/\.json$/.test(path)) {
    let json = JSON.parse(text);
    if (Array.isArray(json)) return json;
    if (Array.isArray(json.data)) return json.data;
    throw Error("JSON must be an array or a { data: [] } object.");
  }
  let result = Papa.parse(text, {
    dynamicTyping: true,
    skipEmptyLines: false,
    preview: LIMIT + 20,
  });
  if (result.errors.length && !result.data.length) throw Error(result.errors[0].message);
  return csvRows(result.data);
}
async function remote(url) {
  if (!url) {
    status("ENTER A DATASET URL", true);
    return;
  }
  status("FETCHING DATA...");
  el.loadButton.disabled = true;
  try {
    let rows = await parse(url);
    loadRows(rows, new URL(url).hostname);
  } catch (error) {
    let blocked = error instanceof TypeError || /source blocked browser access/i.test(error.message),
      msg = blocked
        ? error.message ||
          "Your browser could not access this URL. It is likely blocked by the source server's CORS policy, or there is a network problem."
        : error.message;
    status(blocked ? "BLOCKED BY CORS / NETWORK" : "IMPORT FAILED", true);
    el.preview.textContent = msg;
    el.previewState.textContent = blocked ? "CORS / network blocked" : "Check dataset format";
    el.previewState.classList.add("warning");
  } finally {
    el.loadButton.disabled = false;
  }
}
async function upload(file) {
  if (!file) return;
  status("READING FILE...");
  el.uploadButton.disabled = true;
  try {
    loadRows(await parse(file), file.name);
  } catch (error) {
    status("IMPORT FAILED", true);
    el.preview.textContent = error.message;
    el.previewState.textContent = "Check dataset format";
    el.previewState.classList.add("warning");
  } finally {
    el.uploadButton.disabled = false;
    el.fileInput.value = "";
  }
}
el.loadButton.onclick = () => remote(el.datasetUrl.value.trim());
el.uploadButton.onclick = () => el.fileInput.click();
el.fileInput.onchange = (event) => upload(event.currentTarget.files[0]);
document.querySelectorAll("[data-demo]").forEach((button) => {
  button.onclick = () =>
    loadRows(DEMOS[button.dataset.demo], button.textContent, DEMO_CONFIG_OVERRIDES[button.dataset.demo]);
});
el.datasetUrl.onkeydown = (e) => {
  if (e.key === "Enter") remote(e.currentTarget.value.trim());
};
el.renderButton.onclick = render;
el.exportPngButton.onclick = exportPng;
el.logScale.onchange = render;
el.maxEntries.oninput = render;
el.appShell.addEventListener("dragenter", (event) => {
  if ([...event.dataTransfer.types].includes("Files")) el.appShell.classList.add("dragging");
});
el.appShell.addEventListener("dragover", (event) => {
  if ([...event.dataTransfer.types].includes("Files")) event.preventDefault();
});
el.appShell.addEventListener("dragleave", (event) => {
  if (!el.appShell.contains(event.relatedTarget)) el.appShell.classList.remove("dragging");
});
el.appShell.addEventListener("drop", (event) => {
  el.appShell.classList.remove("dragging");
  if (!event.dataTransfer.files.length) return;
  event.preventDefault();
  upload(event.dataTransfer.files[0]);
});
el.chartType.onchange = () => {
  let type = el.chartType.value;
  if (type === "scatter") {
    selectScatterAxes();
    return;
  }
  if (type === "doughnut" || type === "treemap") {
    let ys = selectedY();
    if (ys.length > 1) selectOnlyY(ys[0]);
  }
  render();
};
el.xColumn.onchange = () => {
  let ys = selectedY();
  if (ys.length === 1 && ys[0] === "__count__") {
    let numeric = state.columns.filter((c) => c.type === "numeric");
    if (numeric.length) selectOnlyY(pickMetric(numeric));
  }
};
lucide.createIcons();
