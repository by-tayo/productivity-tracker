(() => {
  const MAX_SLOTS = 7; // top N get their own color, the rest fold into "Other"
  const OTHER_COLOR_VAR = "--series-8";
  const IDLE_COLOR_VAR = "--series-idle";
  const SLOT_VARS = [
    "--series-1", "--series-2", "--series-3", "--series-4",
    "--series-5", "--series-6", "--series-7",
  ];

  const tooltip = document.getElementById("tooltip");
  const appBarsEl = document.getElementById("app-bars");
  const categoryBarsEl = document.getElementById("category-bars");
  const canvas = document.getElementById("timeline-canvas");
  const ctx = canvas.getContext("2d");
  const legendEl = document.getElementById("timeline-legend");
  const dateInput = document.getElementById("date-input");
  const btnToday = document.getElementById("btn-today");
  const btnYesterday = document.getElementById("btn-yesterday");
  const subtitle = document.getElementById("subtitle");

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function todayStr(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function formatDuration(seconds) {
    seconds = Math.round(seconds);
    if (seconds < 60) return `${seconds}s`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h === 0) return `${m}m`;
    return `${h}h ${m}m`;
  }

  function formatClock(ts) {
    const d = new Date(ts * 1000);
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, "0");
    const ampm = h >= 12 ? "pm" : "am";
    h = h % 12 || 12;
    return `${h}:${m}${ampm}`;
  }

  // Builds a name -> color-hex map: top MAX_SLOTS entries get distinct
  // categorical slots (in the fixed palette order), everything past that
  // folds into "Other" so identity never runs out of colors.
  function buildColorMap(entries) {
    const map = {};
    let otherTotal = 0;
    entries.forEach(([name, seconds], idx) => {
      if (idx < MAX_SLOTS) {
        map[name] = cssVar(SLOT_VARS[idx]);
      } else {
        otherTotal += seconds;
      }
    });
    const folded = entries.slice(0, MAX_SLOTS);
    if (entries.length > MAX_SLOTS) {
      folded.push(["Other", otherTotal]);
      map["Other"] = cssVar(OTHER_COLOR_VAR);
    }
    return { folded, map };
  }

  function showTooltip(x, y, labelText, valueText) {
    tooltip.innerHTML = "";
    const valueEl = document.createElement("div");
    valueEl.className = "tt-value";
    valueEl.textContent = valueText;
    const labelEl = document.createElement("div");
    labelEl.className = "tt-label";
    labelEl.textContent = labelText;
    tooltip.appendChild(valueEl);
    tooltip.appendChild(labelEl);
    tooltip.style.display = "block";
    const rect = tooltip.getBoundingClientRect();
    let left = x + 14;
    let top = y + 14;
    if (left + rect.width > window.innerWidth) left = x - rect.width - 14;
    if (top + rect.height > window.innerHeight) top = y - rect.height - 14;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  function hideTooltip() {
    tooltip.style.display = "none";
  }

  function renderBars(container, entries, colorMap, total) {
    container.innerHTML = "";
    if (entries.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No activity recorded for this day yet.";
      container.appendChild(empty);
      return;
    }
    const max = Math.max(...entries.map(([, s]) => s), 1);

    entries.forEach(([name, seconds]) => {
      const row = document.createElement("div");
      row.className = "bar-row";
      row.tabIndex = 0;

      const nameEl = document.createElement("div");
      nameEl.className = "name";
      nameEl.textContent = name;

      const track = document.createElement("div");
      track.className = "bar-track";
      const fill = document.createElement("div");
      fill.className = "bar-fill";
      fill.style.width = `${(seconds / max) * 100}%`;
      fill.style.background = colorMap[name] || cssVar(OTHER_COLOR_VAR);
      track.appendChild(fill);

      const valueEl = document.createElement("div");
      valueEl.className = "bar-value";
      valueEl.textContent = formatDuration(seconds);

      row.appendChild(nameEl);
      row.appendChild(track);
      row.appendChild(valueEl);

      const pct = total > 0 ? Math.round((seconds / total) * 100) : 0;
      const showTt = (evt) => {
        const pt = evt.touches ? evt.touches[0] : evt;
        showTooltip(pt.clientX, pt.clientY, `${name} • ${pct}% of active time`, formatDuration(seconds));
      };
      row.addEventListener("pointermove", showTt);
      row.addEventListener("pointerleave", hideTooltip);
      row.addEventListener("focus", () => showTooltip(row.getBoundingClientRect().right, row.getBoundingClientRect().top, `${name} • ${pct}% of active time`, formatDuration(seconds)));
      row.addEventListener("blur", hideTooltip);

      container.appendChild(row);
    });
  }

  function renderLegend(entries, colorMap) {
    legendEl.innerHTML = "";
    entries.forEach(([name]) => {
      const item = document.createElement("div");
      item.className = "legend-item";
      const swatch = document.createElement("span");
      swatch.className = "legend-swatch";
      swatch.style.background = colorMap[name] || cssVar(OTHER_COLOR_VAR);
      const label = document.createElement("span");
      label.textContent = name;
      item.appendChild(swatch);
      item.appendChild(label);
      legendEl.appendChild(item);
    });
    const idleItem = document.createElement("div");
    idleItem.className = "legend-item";
    const idleSwatch = document.createElement("span");
    idleSwatch.className = "legend-swatch";
    idleSwatch.style.background = cssVar(IDLE_COLOR_VAR);
    const idleLabel = document.createElement("span");
    idleLabel.textContent = "Idle";
    idleItem.appendChild(idleSwatch);
    idleItem.appendChild(idleLabel);
    legendEl.appendChild(idleItem);
  }

  let currentSegments = [];
  let currentRangeStart = 0;
  let currentRangeEnd = 0;
  let lastAppColors = {};

  function drawTimeline(segments, rangeStart, rangeEnd, colorMap) {
    currentSegments = segments;
    currentRangeStart = rangeStart;
    currentRangeEnd = rangeEnd;

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth || canvas.parentElement.clientWidth;
    const cssHeight = 56;
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    canvas.style.height = `${cssHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = cssVar("--gridline");
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    const span = rangeEnd - rangeStart || 1;
    segments.forEach((seg) => {
      const x = ((seg.start - rangeStart) / span) * cssWidth;
      const w = Math.max(((seg.end - seg.start) / span) * cssWidth, 1);
      ctx.fillStyle = seg.is_idle ? cssVar(IDLE_COLOR_VAR) : (colorMap[seg.app] || cssVar(OTHER_COLOR_VAR));
      ctx.fillRect(x, 0, w, cssHeight);
    });
  }

  function segmentAtX(clientX) {
    const rect = canvas.getBoundingClientRect();
    const relX = clientX - rect.left;
    const span = currentRangeEnd - currentRangeStart || 1;
    const ts = currentRangeStart + (relX / rect.width) * span;
    return currentSegments.find((seg) => ts >= seg.start && ts <= seg.end);
  }

  canvas.addEventListener("pointermove", (evt) => {
    const seg = segmentAtX(evt.clientX);
    if (!seg) { hideTooltip(); return; }
    const label = `${formatClock(seg.start)} – ${formatClock(seg.end)}`;
    const value = seg.is_idle ? "Idle" : seg.app;
    showTooltip(evt.clientX, evt.clientY, label, value);
  });
  canvas.addEventListener("pointerleave", hideTooltip);

  async function loadSummary(dateStr) {
    const res = await fetch(`/api/summary?date=${dateStr}`);
    const data = await res.json();
    if (data.error) return;

    document.getElementById("stat-active").textContent = formatDuration(data.active_seconds);
    document.getElementById("stat-idle").textContent = formatDuration(data.idle_seconds);
    document.getElementById("stat-top").textContent = data.top_app || "—";

    const isToday = dateStr === todayStr();
    subtitle.textContent = isToday
      ? "Time by app today."
      : `Time by app — ${dateStr}.`;

    const { folded: appFolded, map: appColors } = buildColorMap(data.per_app);
    renderBars(appBarsEl, appFolded, appColors, data.active_seconds);

    const { folded: catFolded, map: catColors } = buildColorMap(data.per_category);
    renderBars(categoryBarsEl, catFolded, catColors, data.active_seconds);

    lastAppColors = appColors;
    drawTimeline(data.timeline, data.range_start, data.range_end, appColors);
    renderLegend(appFolded, appColors);
  }

  function setActiveButton(which) {
    btnToday.classList.toggle("active", which === "today");
    btnYesterday.classList.toggle("active", which === "yesterday");
  }

  btnToday.addEventListener("click", () => {
    setActiveButton("today");
    dateInput.value = todayStr();
    loadSummary(todayStr());
  });
  btnYesterday.addEventListener("click", () => {
    setActiveButton("yesterday");
    dateInput.value = todayStr(-1);
    loadSummary(todayStr(-1));
  });
  dateInput.addEventListener("change", () => {
    setActiveButton(dateInput.value === todayStr() ? "today" : dateInput.value === todayStr(-1) ? "yesterday" : "none");
    loadSummary(dateInput.value);
  });
  window.addEventListener("resize", () => {
    if (currentSegments.length) drawTimeline(currentSegments, currentRangeStart, currentRangeEnd, lastAppColors);
  });

  dateInput.value = todayStr();
  loadSummary(todayStr());
  setInterval(() => loadSummary(dateInput.value), 30000);
})();
