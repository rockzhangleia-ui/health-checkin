// ---- Supabase 初始化 ----
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---- 用户配置 ----
const USERS = {
  lei:  { id: 'lei',  name: '石三', emoji: '👨' },
  wife: { id: 'wife', name: '老婆', emoji: '👩' },
};

// ---- 全局状态 ----
let currentUser = null;
let todayData = null;
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();

// ---- 工具函数 ----
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function showToast(msg, duration = 1800) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), duration);
}

function greeting() {
  const h = new Date().getHours();
  if (h < 6)  return '🌙 深夜了，注意休息';
  if (h < 11) return '☀️ 早上好，今天加油！';
  if (h < 13) return '🌞 中午好，记得吃饭';
  if (h < 18) return '🍃 下午好，保持状态';
  if (h < 22) return '🌆 傍晚好，放松一下';
  return '🌜 晚上好，早点休息';
}

// ---- 登录 / 登出 ----
function selectUser(userId, emoji, name) {
  currentUser = USERS[userId];
  localStorage.setItem('hc_user', userId);
  document.getElementById('current-user-emoji').textContent = emoji;
  document.getElementById('current-user-name').textContent = name;
  document.getElementById('login-page').classList.add('hidden');
  document.getElementById('main-page').classList.remove('hidden');
  initToday();
}

function logout() {
  localStorage.removeItem('hc_user');
  currentUser = null;
  todayData = null;
  document.getElementById('main-page').classList.add('hidden');
  document.getElementById('login-page').classList.remove('hidden');
}

// ---- 初始化今日 ----
async function initToday() {
  // 日期和问候
  const d = new Date();
  document.getElementById('today-date').textContent =
    `${d.getMonth()+1}月${d.getDate()}日 ${['日','一','二','三','四','五','六'][d.getDay()]}`;
  document.getElementById('today-greeting').textContent = greeting();

  await loadTodayData();
  await loadPartnerData();
  await loadWeeklyExercise();
}

async function loadTodayData() {
  const today = todayStr();
  const { data, error } = await db
    .from('checkins')
    .select('*')
    .eq('user_id', currentUser.id)
    .eq('date', today)
    .maybeSingle();

  todayData = data || {
    user_id: currentUser.id,
    date: today,
    sleep_start: null,
    sleep_end: null,
    breakfast: false,
    lunch: false,
    dinner: false,
    no_snack: false,
    exercised: false,
  };

  renderTodayUI();
}

function renderTodayUI() {
  const d = todayData;

  // 睡眠
  if (d.sleep_start) document.getElementById('sleep-start').value = d.sleep_start;
  if (d.sleep_end)   document.getElementById('sleep-end').value   = d.sleep_end;
  if (d.sleep_start && d.sleep_end) {
    const mins = sleepMinutes(d.sleep_start, d.sleep_end);
    document.getElementById('sleep-status-text').textContent = formatSleep(mins);
  }

  // 三餐
  ['breakfast','lunch','dinner'].forEach(m => {
    const el = document.getElementById(`meal-${m}`);
    el.classList.toggle('checked', !!d[m]);
  });

  // 开关
  ['no_snack','exercised'].forEach(k => {
    const el = document.getElementById(`toggle-${k}`);
    el.classList.toggle('on', !!d[k]);
  });
}

// ---- 睡眠 ----
function sleepMinutes(start, end) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return mins;
}

function formatSleep(mins) {
  const h = Math.floor(mins / 60), m = mins % 60;
  const tag = mins >= 420 ? '😊 充足' : mins >= 360 ? '😐 还好' : '😴 偏少';
  return `${h}h${m > 0 ? m+'m' : ''} ${tag}`;
}

async function saveSleep() {
  const start = document.getElementById('sleep-start').value;
  const end   = document.getElementById('sleep-end').value;
  if (!start || !end) return;
  todayData.sleep_start = start;
  todayData.sleep_end   = end;
  await upsertToday();
  const mins = sleepMinutes(start, end);
  document.getElementById('sleep-status-text').textContent = formatSleep(mins);
  showToast('睡眠记录已保存 😴');
}

// ---- 餐食 ----
async function toggleMeal(meal) {
  todayData[meal] = !todayData[meal];
  document.getElementById(`meal-${meal}`).classList.toggle('checked', todayData[meal]);
  await upsertToday();
  showToast(todayData[meal] ? '✓ 打卡成功！' : '已取消');
}

// ---- 开关项 ----
async function toggleItem(key) {
  todayData[key] = !todayData[key];
  document.getElementById(`toggle-${key}`).classList.toggle('on', todayData[key]);
  await upsertToday();
  if (key === 'exercised') await loadWeeklyExercise();
  showToast(todayData[key] ? '✓ 打卡成功！' : '已取消');
}

// ---- 写入数据库 ----
async function upsertToday() {
  const { error } = await db.from('checkins').upsert(todayData, { onConflict: 'user_id,date' });
  if (error) showToast('保存失败，请检查网络');
}

// ---- 伴侣状态 ----
async function loadPartnerData() {
  const partnerId = currentUser.id === 'lei' ? 'wife' : 'lei';
  const partner   = USERS[partnerId];
  const { data } = await db
    .from('checkins')
    .select('*')
    .eq('user_id', partnerId)
    .eq('date', todayStr())
    .maybeSingle();

  const card = document.getElementById('partner-card');
  if (!data) {
    card.innerHTML = `
      <div class="partner-header">
        <span class="partner-header-emoji">${partner.emoji}</span>
        <span class="partner-header-name">${partner.name}</span>
      </div>
      <p class="partner-no-data">今天还没有打卡记录～</p>`;
    return;
  }

  const items = [
    { key: 'breakfast', label: '早餐 🌅' },
    { key: 'lunch',     label: '午餐 ☀️' },
    { key: 'dinner',    label: '晚餐 🌙' },
    { key: 'no_snack',  label: '不吃零食 🚫' },
    { key: 'exercised', label: '运动 🏃' },
  ];
  const done  = items.filter(i => data[i.key]).length;
  const total = items.length + (data.sleep_start ? 1 : 0);
  const sleepDone = data.sleep_start && data.sleep_end;
  if (sleepDone) done + 1;

  const tags = items.map(i =>
    `<span class="partner-tag ${data[i.key] ? 'done' : 'pending'}">${data[i.key] ? '✓' : '○'} ${i.label}</span>`
  ).join('');

  const sleepTag = sleepDone
    ? `<span class="partner-tag done">✓ 睡眠 ${formatSleep(sleepMinutes(data.sleep_start, data.sleep_end))}</span>`
    : `<span class="partner-tag pending">○ 睡眠未记录</span>`;

  card.innerHTML = `
    <div class="partner-header">
      <span class="partner-header-emoji">${partner.emoji}</span>
      <span class="partner-header-name">${partner.name}</span>
      <span class="partner-header-score">${done}/${items.length} 完成</span>
    </div>
    <div class="partner-items">${sleepTag}${tags}</div>`;
}

// ---- 每周运动进度 ----
async function loadWeeklyExercise() {
  const now = new Date();
  const day = now.getDay(); // 0=日
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0,0,0,0);
  const mondayStr = todayStr.call({ getFullYear: () => monday.getFullYear(),
    getMonth: () => monday.getMonth(), getDate: () => monday.getDate() });

  // 手动构造本周日期字符串
  const weekDates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    weekDates.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
  }

  const { data } = await db
    .from('checkins')
    .select('date, exercised')
    .eq('user_id', currentUser.id)
    .in('date', weekDates);

  const exercisedDates = new Set((data || []).filter(r => r.exercised).map(r => r.date));
  const count = exercisedDates.size;
  const target = 3;

  const dotsEl = document.getElementById('weekly-dots');
  const labels = ['一','二','三','四','五','六','日'];
  dotsEl.innerHTML = weekDates.map((date, i) => {
    const done = exercisedDates.has(date);
    const isToday = date === todayStr();
    let cls = done ? 'done' : (isToday ? 'target' : 'empty');
    return `<div class="progress-dot ${cls}" title="${labels[i]}">${labels[i]}</div>`;
  }).join('');

  document.getElementById('weekly-count').textContent =
    `${count}/${target} 次${count >= target ? ' 🎉' : ''}`;
}

// ---- Tab 切换 ----
function switchTab(tab) {
  ['today','history'].forEach(t => {
    document.getElementById(`tab-content-${t}`).classList.toggle('hidden', t !== tab);
    document.getElementById(`tab-${t}`).classList.toggle('active', t === tab);
  });
  if (tab === 'history') renderCalendar();
}

// ---- 日历 ----
async function renderCalendar() {
  const title = `${calYear}年${calMonth+1}月`;
  document.getElementById('cal-title').textContent = title;

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  const today = todayStr();

  // 拉取本月数据
  const from = `${calYear}-${String(calMonth+1).padStart(2,'0')}-01`;
  const to   = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(daysInMonth).padStart(2,'0')}`;
  const { data } = await db
    .from('checkins')
    .select('date, breakfast, lunch, dinner, no_snack, exercised, sleep_start')
    .eq('user_id', currentUser.id)
    .gte('date', from)
    .lte('date', to);

  const scoreMap = {};
  (data || []).forEach(r => {
    const fields = ['breakfast','lunch','dinner','no_snack','exercised','sleep_start'];
    const done = fields.filter(f => r[f]).length;
    scoreMap[r.date] = done / fields.length;
  });

  const grid = document.getElementById('calendar-grid');
  const headers = ['日','一','二','三','四','五','六'];
  let html = headers.map(h => `<div class="cal-header">${h}</div>`).join('');

  const startOffset = firstDay; // 0=Sunday
  for (let i = 0; i < startOffset; i++) html += '<div class="cal-day"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const score = scoreMap[dateStr];
    let cls = 'cal-day';
    if (dateStr === today) cls += ' today';
    if (score === 1) cls += ' full';
    else if (score > 0) cls += ' partial';
    html += `<div class="${cls}" onclick="showDayDetail('${dateStr}')">${d}</div>`;
  }
  grid.innerHTML = html;
}

function changeMonth(delta) {
  calMonth += delta;
  if (calMonth < 0)  { calMonth = 11; calYear--; }
  if (calMonth > 11) { calMonth = 0;  calYear++; }
  document.getElementById('history-detail').style.display = 'none';
  renderCalendar();
}

async function showDayDetail(dateStr) {
  // highlight selected
  document.querySelectorAll('.cal-day.selected').forEach(el => el.classList.remove('selected'));
  const cells = document.querySelectorAll('.cal-day');
  const day = parseInt(dateStr.split('-')[2]);
  cells.forEach(el => { if (parseInt(el.textContent) === day) el.classList.add('selected'); });

  const { data } = await db
    .from('checkins').select('*').eq('user_id', currentUser.id).eq('date', dateStr).maybeSingle();

  const detail = document.getElementById('history-detail');
  const title  = document.getElementById('history-detail-title');
  const content = document.getElementById('history-detail-content');
  const [y, m, d2] = dateStr.split('-');
  title.textContent = `${parseInt(m)}月${parseInt(d2)}日`;
  detail.style.display = 'block';

  if (!data) {
    content.innerHTML = '<div class="history-detail-card"><p style="color:#aaa;text-align:center;padding:12px">当天无记录</p></div>';
    return;
  }

  const sleepText = data.sleep_start && data.sleep_end
    ? `${data.sleep_start} → ${data.sleep_end}（${formatSleep(sleepMinutes(data.sleep_start, data.sleep_end))}）`
    : '未记录';

  const rows = [
    { icon: '😴', label: '睡眠',    value: sleepText, ok: !!(data.sleep_start && data.sleep_end) },
    { icon: '🌅', label: '早餐',    value: data.breakfast ? '✓ 健康饮食' : '未打卡', ok: data.breakfast },
    { icon: '☀️', label: '午餐',    value: data.lunch     ? '✓ 健康饮食' : '未打卡', ok: data.lunch     },
    { icon: '🌙', label: '晚餐',    value: data.dinner    ? '✓ 健康饮食' : '未打卡', ok: data.dinner    },
    { icon: '🚫', label: '不吃零食', value: data.no_snack  ? '✓ 做到了！' : '未打卡', ok: data.no_snack  },
    { icon: '🏃', label: '运动',    value: data.exercised ? '✓ 已运动'   : '未运动', ok: data.exercised },
  ];

  content.innerHTML = `<div class="history-detail-card">${rows.map(r => `
    <div class="history-row">
      <span class="history-icon">${r.icon}</span>
      <span class="history-label">${r.label}</span>
      <span class="history-value ${r.ok ? 'ok' : ''}">${r.value}</span>
    </div>`).join('')}</div>`;

  detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---- 启动 ----
(function init() {
  const saved = localStorage.getItem('hc_user');
  if (saved && USERS[saved]) {
    const u = USERS[saved];
    selectUser(u.id, u.emoji, u.name);
  }
})();
