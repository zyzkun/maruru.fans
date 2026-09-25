const biliApiUrl = () =>
  `https://api.bilibili.com/x/relation/stat?vmid=${BILIBILI_UID}&time=${Date.now()}`;

const PROXY_LIST = [
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`,
];

const SNAPSHOT_KEY = 'bilibili_maluolulu_daily_snapshots_v1';
const LAST_SNAPSHOT_DATE_KEY = 'bilibili_maluolulu_last_snapshot_date_v1';

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
let currentFans = 0;

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
  setLastSnapshotDate(dateKey);
  updateTodayGainText(fans);
  renderSnapshotChart();
}

function ensureDailySnapshot(fans) {
  const dateKey = getBjtDateKey();
  const lastSnapshotDate = getLastSnapshotDate();

  if (lastSnapshotDate !== dateKey) {
    saveDailySnapshot(fans);
  } else {
    const snapshots = getSnapshots();
    const existing = snapshots.find((item) => item.date === dateKey);
    if (existing && Number(existing.count) !== Number(fans)) {
      existing.count = fans;
      snapshots.sort((a, b) => a.date.localeCompare(b.date));
      setSnapshots(snapshots);
      updateTodayGainText(fans);
      renderSnapshotChart();
    }
  }
}

function renderSnapshotChart() {
  const snapshotChart = document.getElementById('snapshotChart');
  const snapshotList = document.getElementById('snapshotList');

  if (!snapshotChart || !snapshotList) return;

  const snapshots = getSnapshots()
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

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
    .map((point) => {
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
  for (const buildUrl of PROXY_LIST) {
    let ok = false;
    try {
      const response = await fetchWithTimeout(buildUrl(biliApiUrl()));
      const data = await response.json();
      if (data.code === 0) {
        const newFans = Number(data.data.follower);
        const change = currentFans === 0 ? 0 : newFans - currentFans;

        currentFans = newFans;
        fansDisplay.textContent = newFans.toLocaleString();
        updateProgress(newFans);
        updateIntroText(newFans);
        ensureDailySnapshot(newFans);
        showChange(change);
        ok = true;
      } else {
        console.error('API error:', data);
        ok = true;
      }
    } catch (error) {
      console.error('Proxy failed, try next:', buildUrl(biliApiUrl()), error);
    }

    if (ok) break;
  }

  setTimeout(() => {
    fetchFans();
  }, 5000);
}

fansDisplay.textContent = '0';
updateProgress(0);
updateIntroText(0);
updateTodayGainText(0);
renderSnapshotChart();

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
