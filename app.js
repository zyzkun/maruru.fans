const biliApiUrl = () =>
  `https://api.bilibili.com/x/relation/stat?vmid=${BILIBILI_UID}&time=${Date.now()}`;

const PROXY_LIST = [
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`,
];

const SNAPSHOT_KEY = 'bilibili_maluolulu_daily_snapshots_v1';

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

function updateTodayGainText(fans) {
  if (!todayGain) return;
  const snapshots = getSnapshots();
  const todayKey = getBjtDateKey();
  const previous = [...snapshots].reverse().find((item) => item.date < todayKey);
  const gain = previous ? fans - previous.count : 0;
  const sign = gain >= 0 ? '+' : '';
  todayGain.textContent = `今日新增：${sign}${gain.toLocaleString()}`;
}

function saveDailySnapshot(fans) {
  const snapshots = getSnapshots();
  const dateKey = getBjtDateKey();
  const existing = snapshots.find((item) => item.date === dateKey);

  if (existing) {
    existing.count = fans;
  } else {
    snapshots.push({ date: dateKey, count: fans });
  }

  setSnapshots(snapshots);
  updateTodayGainText(fans);
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
        saveDailySnapshot(newFans);
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
fetchFans();
