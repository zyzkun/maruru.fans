const biliApiUrl = () => {
  if (window.location.port === '8000') return '/api/fans';
  return 'http://localhost:8000/api/fans';
};
const UAPI_UID = '3461581784484215';
const FETCH_TIMEOUT_MS = 6000;

const SNAPSHOT_KEY = 'bilibili_maluolulu_daily_snapshots_v1';
const LAST_SNAPSHOT_DATE_KEY = 'bilibili_maluolulu_last_snapshot_date_v1';
const LAST_KNOWN_FANS_KEY = 'bilibili_maluolulu_last_known_fans_v1';
const HISTORY_CSV_URL = './近90天数据趋势.csv';
let historicalTrend = [];

async function fetchWithTimeout(url, ms = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

const fansDisplay = document.getElementById('fansDisplay');
const progressFill = document.getElementById('progressFill');
const changeToast = document.getElementById('changeToast');
const introCurrentFans = document.getElementById('introCurrentFans');
const todayGain = document.getElementById('todayGain');
const LOADING_TEXT = '加载中...';
let currentFans = 0;
let lastKnownFans = null;

function getBjtDateKey(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

function getLastSnapshotDate() {
  try {
    return localStorage.getItem(LAST_SNAPSHOT_DATE_KEY) || null;
  } catch (error) {
    console.error('读取上次快照日期失败:', error);
    return null;
  }
}

function setLastSnapshotDate(dateKey) {
  try {
    localStorage.setItem(LAST_SNAPSHOT_DATE_KEY, dateKey);
  } catch (error) {
    console.error('写入上次快照日期失败:', error);
  }
}

function getLastKnownFans() {
  try {
    const raw = localStorage.getItem(LAST_KNOWN_FANS_KEY);
    if (raw === null) return null;

    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch (error) {
    console.error('读取缓存粉丝数失败:', error);
    return null;
  }
}

function getLatestSnapshotCount() {
  try {
    const snapshots = getSnapshots();
    if (!snapshots.length) return null;

    const latest = [...snapshots].sort((a, b) => a.date.localeCompare(b.date)).pop();
    const value = Number(latest?.count);
    return Number.isFinite(value) ? value : null;
  } catch (error) {
    console.error('读取最新快照失败:', error);
    return null;
  }
}

function getFallbackDisplayFans() {
  const savedFans = getLastKnownFans();
  const latestSnapshotCount = getLatestSnapshotCount();

  if (savedFans === null) return null;
  if (latestSnapshotCount === null) return savedFans;

  return Math.max(savedFans, latestSnapshotCount);
}

function setLastKnownFans(value) {
  try {
    localStorage.setItem(LAST_KNOWN_FANS_KEY, String(value));
  } catch (error) {
    console.error('写入缓存粉丝数失败:', error);
  }
}

function getSnapshots() {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (error) {
    console.error('读取快照失败:', error);
    return [];
  }
}

function setSnapshots(list) {
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(list.slice(-30)));
}

function normalizeCsvDate(dateText) {
  const trimmed = String(dateText || '').trim();
  if (!trimmed) return null;

  const match = trimmed.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (!match) return null;

  const [, year, month, day] = match;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseHistoryCsv(csvText) {
  if (!csvText) return [];

  const rows = csvText
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean);

  if (rows.length < 2) return [];

  const parsed = [];

  for (let i = 1; i < rows.length; i += 1) {
    const cells = rows[i].split(',');
    const [dateText, totalText, newText, cancelText] = cells.map((cell) => cell.trim());
    const normalizedDate = normalizeCsvDate(dateText);
    const total = Number(totalText);

    if (!normalizedDate || !Number.isFinite(total)) continue;

    parsed.push({
      date: normalizedDate,
      count: total,
      newCount: Number(newText) || 0,
      cancelCount: Number(cancelText) || 0,
    });
  }

  return parsed
    .filter((item) => item.date)
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function loadHistoryTrend() {
  try {
    const response = await fetch(HISTORY_CSV_URL, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`CSV fetch failed: ${response.status}`);
    }

    const csvText = await response.text();
    const parsed = parseHistoryCsv(csvText);
    if (!parsed.length) {
      return;
    }

    historicalTrend = parsed.slice(-30);
    setSnapshots(parsed.slice(-30));
    renderSnapshotChart();
    console.log('Loaded recent 30-day history trend from CSV:', historicalTrend.length);
  } catch (error) {
    console.warn('Failed to load recent 30-day trend CSV:', error);
  }
}

function setLoadingState() {
  const fallbackFans = getFallbackDisplayFans();

  if (fallbackFans !== null) {
    const displayValue = `${fallbackFans.toLocaleString()}~`;
    if (fansDisplay) fansDisplay.textContent = displayValue;
    if (introCurrentFans) introCurrentFans.textContent = displayValue;
    if (todayGain) {
      const gain = getYesterdayComparisonValue(fallbackFans);
      const sign = gain >= 0 ? '+' : '';
      todayGain.textContent = `今日新增：${sign}${gain.toLocaleString()}`;
    }
    if (progressFill) progressFill.style.width = `${Math.min(100, (fallbackFans / TOTAL_GOAL) * 100).toFixed(2)}%`;
    return;
  }

  if (fansDisplay) fansDisplay.textContent = LOADING_TEXT;
  if (introCurrentFans) introCurrentFans.textContent = LOADING_TEXT;
  if (todayGain) todayGain.textContent = '今日新增：加载中...';
  if (progressFill) progressFill.style.width = '0%';
}

function updateIntroText(fans) {
  if (!introCurrentFans) return;
  introCurrentFans.textContent = `${fans.toLocaleString()} `;
}

function getYesterdayComparisonValue(fans) {
  const snapshots = getSnapshots();
  const todayKey = getBjtDateKey();
  const previous = [...snapshots]
    .filter((item) => item.date < todayKey)
    .sort((a, b) => a.date.localeCompare(b.date))
    .pop();
  const previousCount = previous ? Number(previous.count) : 0;
  return fans - previousCount;
}

function updateTodayGainText(fans) {
  if (!todayGain) return;
  const gain = getYesterdayComparisonValue(fans);
  const sign = gain >= 0 ? '+' : '';
  todayGain.textContent = `今日新增：${sign}${gain.toLocaleString()}`;
}

function saveDailySnapshot(fans) {
  const snapshots = getSnapshots();
  const dateKey = getBjtDateKey();
  const existingIndex = snapshots.findIndex((item) => item.date === dateKey);

  if (existingIndex >= 0) {
    snapshots[existingIndex].count = fans;
  } else {
    snapshots.push({ date: dateKey, count: fans });
  }

  snapshots.sort((a, b) => a.date.localeCompare(b.date));
  setSnapshots(snapshots);
  setLastKnownFans(fans);
  setLastSnapshotDate(dateKey);
  updateTodayGainText(fans);
  renderSnapshotChart();
}

function ensureDailySnapshot(fans) {
  const dateKey = getBjtDateKey();
  const lastSnapshotDate = getLastSnapshotDate();

  if (lastSnapshotDate !== dateKey) {
    saveDailySnapshot(fans);
    return;
  }

  const snapshots = getSnapshots();
  const existing = snapshots.find((item) => item.date === dateKey);
  if (existing && Number(existing.count) !== Number(fans)) {
    existing.count = fans;
    snapshots.sort((a, b) => a.date.localeCompare(b.date));
    setSnapshots(snapshots);
    setLastKnownFans(fans);
    updateTodayGainText(fans);
    renderSnapshotChart();
  }
}

function renderSnapshotChart(isLoading = false) {
  const snapshotChart = document.getElementById('snapshotChart');
  const snapshotList = document.getElementById('snapshotList');

  if (!snapshotChart || !snapshotList) return;

  const snapshots = (historicalTrend.length ? historicalTrend : getSnapshots())
    .slice(-30)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (isLoading) {
    snapshotChart.innerHTML = '<div class="chart-empty">加载中...</div>';
    snapshotList.innerHTML = '<li class="snapshot-empty">加载中...</li>';
    return;
  }

  if (!snapshots.length) {
    snapshotChart.innerHTML = '<div class="chart-empty">暂无历史快照</div>';
    snapshotList.innerHTML = '<li class="snapshot-empty">暂无记录</li>';
    return;
  }

  const width = 720;
  const height = 220;
  const left = 42;
  const right = 16;
  const top = 18;
  const bottom = 28;
  const maxValue = Math.max(...snapshots.map((item) => Number(item.count)), 1);
  const minValue = Math.min(...snapshots.map((item) => Number(item.count)), 0);
  const valueRange = maxValue - minValue || 1;

  const points = snapshots.map((item, index) => {
    const x = left + (index * (width - left - right)) / Math.max(snapshots.length - 1, 1);
    const y =
      height -
      bottom -
      ((Number(item.count) - minValue) / valueRange) * (height - top - bottom);
    return { ...item, x, y };
  });

  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');

  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - bottom} L ${points[0].x} ${height - bottom} Z`;

  const labels = points
    .map((point, index) => {
      const isFinalPoint = index === points.length - 1;
      const shouldShow = index === 0 || (index % 7 === 0 && !isFinalPoint && index < points.length - 1);
      if (!shouldShow) return '';
      const labelText = point.date.slice(5);
      return `<text x="${point.x}" y="${height - 8}" text-anchor="middle">${labelText}</text>`;
    })
    .join('');

  const yTicks = Array.from({ length: 4 }, (_, idx) => {
    const value = Math.round(maxValue - (idx * valueRange) / 3);
    const y = top + (idx * (height - top - bottom)) / 3;
    return `<line x1="${left}" x2="${width - right}" y1="${y}" y2="${y}" class="chart-grid" />
      <text x="${left - 8}" y="${y + 4}" text-anchor="end">${value.toLocaleString()}</text>`;
  }).join('');

  const dots = points
    .map((point, index) => {
      const className = index === points.length - 1 ? 'chart-dot-last' : 'chart-dot';
      return `<circle class="${className}" cx="${point.x}" cy="${point.y}" r="${index === points.length - 1 ? 5 : 3}" />`;
    })
    .join('');

  snapshotChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="粉丝数趋势图">
      <line x1="${left}" x2="${width - right}" y1="${height - bottom}" y2="${height - bottom}" class="chart-axis" />
      <line x1="${left}" x2="${left}" y1="${top}" y2="${height - bottom}" class="chart-axis" />
      ${yTicks}
      <path d="${areaPath}" fill="rgba(59, 140, 255, 0.10)" />
      <path d="${linePath}" class="chart-line" />
      ${dots}
      ${labels}
    </svg>
  `;

  snapshotList.innerHTML = snapshots
    .slice()
    .reverse()
    .map((item, index, all) => {
      const previous = index === all.length - 1 ? null : all[index + 1];
      const diff = previous ? Number(item.count) - Number(previous.count) : 0;
      const sign = diff >= 0 ? '+' : '';
      return `
        <li class="snapshot-item">
          <span>${item.date}</span>
          <strong>${Number(item.count).toLocaleString()}</strong>
          <em>${sign}${diff.toLocaleString()}</em>
        </li>
      `;
    })
    .join('');
}

function updateProgress(fans) {
  const percent = (fans / TOTAL_GOAL) * 100;
  progressFill.style.width = `${Math.min(100, percent).toFixed(2)}%`;
}

function showChange(change) {
  if (change === 0) return;
  const sign = change > 0 ? '+' : '';
  changeToast.textContent = `${sign}${change}`;
  changeToast.classList.add('show');
  setTimeout(() => {
    changeToast.classList.remove('show');
  }, 500);
}

async function fetchFans() {
  try {
    const response = await fetchWithTimeout(biliApiUrl(), FETCH_TIMEOUT_MS);
    const data = await response.json();
    const followerValue = Number(data?.follower ?? data?.data?.follower ?? data?.fans ?? data?.data?.fans ?? 0);

    if (response.ok && Number.isFinite(followerValue) && followerValue > 0) {
      const newFans = followerValue;
      const change = currentFans === 0 ? 0 : newFans - currentFans;

      currentFans = newFans;
      lastKnownFans = newFans;
      setLastKnownFans(newFans);

      fansDisplay.textContent = newFans.toLocaleString();
      updateProgress(newFans);
      updateIntroText(newFans);
      ensureDailySnapshot(newFans);
      showChange(change);
      return;
    }

    if (data && data.error) {
      console.warn('Backend fan API error:', data.error);
    }
  } catch (error) {
    console.warn('Backend fan API fetch failed:', error);
  }

  const fallbackFans = getFallbackDisplayFans();
  if (fallbackFans !== null) {
    const fallbackText = `${fallbackFans.toLocaleString()}~`;
    fansDisplay.textContent = fallbackText;
    updateProgress(fallbackFans);
    if (introCurrentFans) introCurrentFans.textContent = fallbackText;
    if (todayGain) {
      const gain = getYesterdayComparisonValue(fallbackFans);
      const sign = gain >= 0 ? '+' : '';
      todayGain.textContent = `今日新增：${sign}${gain.toLocaleString()}`;
    }
  } else {
    setLoadingState();
  }

  setTimeout(() => {
    fetchFans();
  }, 5000);
}

lastKnownFans = getLastKnownFans();
setLoadingState();
renderSnapshotChart(true);
loadHistoryTrend();

setInterval(() => {
  if (currentFans > 0) {
    ensureDailySnapshot(currentFans);
  }
}, 60000);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && currentFans > 0) {
    ensureDailySnapshot(currentFans);
  }
});

fetchFans();
