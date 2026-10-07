/* TRON Monitor — рабочее мини-приложение. Данные приходят из функции bot в Supabase.
   Доступ проверяется по подписи Telegram: каждый видит только свои кошельки и адреса,
   список всех пользователей — только владелец бота. */
(() => {
  const API = window.TRON_API;
  const tg = window.Telegram?.WebApp;
  const initData = tg?.initData || '';
  try { tg?.ready(); tg?.expand(); tg?.disableVerticalSwipes?.(); } catch {}

  // ---------- иконки и форматирование (как в макете) ----------
  const paths = {
    home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21v-7h6v7"/>',
    list:'<path d="M8 5h13M8 12h13M8 19h13"/><circle cx="3" cy="5" r=".6"/><circle cx="3" cy="12" r=".6"/><circle cx="3" cy="19" r=".6"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2z"/>',
    settings:'<path d="M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z"/><circle cx="12" cy="12" r="3"/>',
    copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v13h5"/>',
    plus:'<path d="M12 4v16M4 12h16"/>',
    arrow:'<path d="M5 19 19 5M5 5h14v14"/>',
    down:'<path d="M12 4v16m-6-6 6 6 6-6"/>',
    up:'<path d="M12 20V4m-6 6 6-6 6 6"/>',
    alert:'<path d="M5 20h14v-3H5zM7 17v-5a5 5 0 0 1 10 0v5M12 2v2M3 5l2 2m16-2-2 2"/>',
    signal:'<circle cx="12" cy="12" r="1.8"/><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
    close:'<path d="m6 6 12 12M6 18 18 6"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    wallet:'<path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1z"/><path d="M4 7V6a2 2 0 0 1 2-2h10v3"/><circle cx="16" cy="13.5" r="1.2"/>',
    refresh:'<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'
  };
  const icon = (n, cls='') => `<svg class="line-icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[n]}</svg>`;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const short = a => !a ? '' : a.length > 12 ? `${a.slice(0,6)}…${a.slice(-4)}` : a;
  const money = n => { const [i,f] = Math.abs(Number(n)||0).toFixed(2).split('.'); return i.replace(/\B(?=(\d{3})+(?!\d))/g,' ') + (f==='00' ? '' : `<span class="cents">.${f}</span>`); };
  const usd = n => Math.round(Math.abs(Number(n)||0)).toLocaleString('en-US') + ' $';
  const hSum = (type,n) => `<span class="h-sum"><span class="sign">${type==='in'?'+':'−'}</span>${usd(n)}</span>`;
  const amount = (type,n) => `<span class="sign">${type==='in'?'+':'−'}</span>${money(n)}`;
  const plural = (n, one, few, many) => { const m10=n%10, m100=n%100; return m10===1&&m100!==11 ? one : m10>=2&&m10<=4&&(m100<12||m100>14) ? few : many; };
  const DAY = 864e5;
  const tz = () => state.data?.tz || 'UTC';
  const fmt = (ts, o) => { try { return new Intl.DateTimeFormat('ru-RU', {timeZone: tz(), ...o}).format(ts); } catch { return new Intl.DateTimeFormat('ru-RU', o).format(ts); } };
  const time = ts => fmt(ts, {hour:'2-digit', minute:'2-digit'});
  const dayKey = ts => fmt(ts, {year:'numeric', month:'2-digit', day:'2-digit'});
  const dayLong = ts => fmt(ts, {day:'2-digit', month:'long'}).toUpperCase();
  const when = ts => dayKey(ts) === dayKey(state.data.now) ? time(ts) : `${fmt(ts,{day:'2-digit',month:'short'})} ${time(ts)}`;
  const scanUrl = id => `https://tronscan.org/#/transaction/${encodeURIComponent(id)}`;

  // ---------- состояние ----------
  const state = { tab: 'home', data: null, status: 'loading', error: '', code: 0, filter: 'all', shown: 40, addOpen: false, open: '', wk: null, wkp: 'week', seg: 'wallets', user: '' };
  const root = document.getElementById('root');

  async function call(op, extra = {}) {
    // text/plain — чтобы браузер не делал лишний предварительный CORS-запрос
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify({ initData, op, ...extra }) });
    let j = {}; try { j = await r.json(); } catch {}
    if (!r.ok) throw Object.assign(new Error(j.error || `Ошибка сервера (${r.status})`), { status: r.status });
    return j;
  }

  let loading = null, again = false;
  async function load(manual = false) {
    // если обновление уже идёт — дождаться его и обновить ещё раз (например, сразу после добавления кошелька)
    if (loading) { again = true; return loading; }
    loading = loadOnce(manual);
    try { await loading; } finally { loading = null; }
    if (again) { again = false; await load(); }
  }
  async function loadOnce(manual) {
    if (manual) toast('Обновляю…');
    try {
      state.data = await call('overview');
      state.status = 'ok';
      if (manual) toast('Обновлено');
    } catch (e) {
      if (!state.data) { state.status = 'error'; state.error = e.message; state.code = e.status || 0; }
      else toast('Не удалось обновить: ' + e.message);
    } finally { render(); }
  }

  // ---------- вычисления ----------
  const flaggedSet = () => new Set(state.data.flagged);
  const txs = () => { const f = flaggedSet(); return state.data.transfers.map(t => ({ ...t, flagged: t.type === 'out' && f.has(t.who) })); };
  const totalUsdt = () => state.data.wallets.reduce((s, w) => s + (w.usdt || 0), 0);
  const totalTrx = () => state.data.wallets.reduce((s, w) => s + (w.trx || 0), 0);
  const tronError = () => state.data.wallets.some(w => w.error);
  const botAlive = () => { const m = state.data.meta || {}; return m.last_poll && state.data.now / 1000 - m.last_poll <= 180 && m.last_poll_ok !== false; };

  function last7(valueForDay) { // массив из 7 значений: от 6 дней назад до сегодня
    const keys = [...Array(7)].map((_, i) => dayKey(state.data.now - (6 - i) * DAY));
    return valueForDay(keys);
  }
  function balanceSeries() {
    return last7(keys => {
      const net = {}; for (const t of state.data.transfers) { const k = dayKey(t.ts); net[k] = (net[k] || 0) + (t.type === 'in' ? t.amount : -t.amount); }
      const pts = []; let bal = totalUsdt();
      for (let i = 6; i >= 0; i--) { pts[i] = bal; bal -= net[keys[i]] || 0; }
      return pts;
    });
  }
  function flaggedSeries() {
    return last7(keys => {
      const per = {}; for (const t of txs()) if (t.flagged) { const k = dayKey(t.ts); per[k] = (per[k] || 0) + t.amount; }
      let run = 0; return keys.map(k => (run += per[k] || 0));
    });
  }
  function spark(points, dark = false, label = 'Динамика за 7 дней') {
    const min = Math.min(...points), max = Math.max(...points);
    const xy = points.map((v, i) => [3 + i * (292 / (points.length - 1)), max === min ? 30 : 54 - (v - min) / (max - min) * 48]);
    let d = `M${xy[0][0].toFixed(1)} ${xy[0][1].toFixed(1)}`;
    for (let i = 1; i < xy.length; i++) { const [x0, y0] = xy[i-1], [x1, y1] = xy[i], mx = (x0 + x1) / 2; d += `C${mx.toFixed(1)} ${y0.toFixed(1)} ${mx.toFixed(1)} ${y1.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`; }
    const [lx, ly] = xy[xy.length - 1];
    return `<svg viewBox="0 0 300 62" class="sparkline ${dark?'dark':''}" role="img" aria-label="${label}"><path class="chart-guide" d="M0 56h300M0 28h300"/><path class="chart-line" d="${d}"/><circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="3"/></svg>`;
  }

  // ---------- карточки ----------
  // ---------- история: строка со значком-«монетой» ----------
  const kind = t => t.type === 'in' ? 'Пополнение' : 'Вывод';
  const coin = t => `<span class="h-coin ${t.flagged ? 'flag' : t.type}" aria-hidden="true">${icon(t.flagged ? 'signal' : t.type === 'in' ? 'down' : 'up')}<i class="h-dot"></i></span>`;
  const hRow = (t, full = false) => {
    const open = state.open === t.id;
    return `<div class="h-item ${open ? 'open' : ''} ${t.flagged ? 'flag' : ''}"><button class="h-row" data-row="${esc(t.id)}" aria-expanded="${open}">${coin(t)}<span class="h-text"><strong>${kind(t)}</strong><small><span class="h-who">${t.flagged ? '<span class="h-ctl">под контролем</span>' : esc(t.who.length > 10 ? t.who.slice(0,4) + '…' + t.who.slice(-4) : t.who)}</span><span class="h-time">· ${time(t.ts)}</span></small></span><span class="h-amt ${t.type}">${hSum(t.type, t.amount)}</span></button>${open ? `<div class="h-more"><div><span>Дата</span><strong>${fmt(t.ts, {day:'numeric', month:'long', year:'numeric'})}, ${time(t.ts)}</strong></div><div><span>Баланс после</span><strong>${money(t.balance)} <small>USDT</small></strong></div><div><span>${t.type === 'in' ? 'Откуда' : 'Куда'}</span><button class="h-copy" data-copy="${esc(t.who)}">${esc(short(t.who))}${icon('copy')}</button></div>${state.data.wallets.length > 1 ? `<div><span>Кошелёк</span><button class="h-copy" data-copy="${esc(t.wallet)}">${esc(short(t.wallet))}${icon('copy')}</button></div>` : ''}<button class="scan-button" data-open="${scanUrl(t.id)}">Открыть в TronScan ${icon('arrow')}</button></div>` : ''}</div>`;
  };
  const empty = text => `<div class="app-empty">${text}</div>`;

  // ---------- экраны ----------
  function home() {
    const d = state.data, list = txs().slice(0, 5), alive = botAlive(), nw = d.wallets.length;
    const none = !nw ? `<p class="history-empty">Пока нет кошельков. Добавь кошелёк, и здесь появятся его операции.</p><button class="phone-primary" data-goto-wallets>${icon('plus')}Добавить кошелёк</button>` : '';
    return `<div class="app-heading"><div><p class="phone-eyebrow">${nw > 1 ? `ВАШИ КОШЕЛЬКИ · ${nw}` : 'ВАШ КОШЕЛЁК'}</p><h1>Обзор</h1></div><span class="protocol-pill">TRC20</span></div>
<section class="balance-card"><div class="balance-top"><span class="coin-glyph">₮</span><span>Общий баланс</span><span class="balance-network">TRON</span></div><svg class="balance-orbit" viewBox="0 0 220 220" aria-hidden="true"><circle cx="110" cy="110" r="103"/><path d="M39 184A103 103 0 1 1 203 155"/><circle class="orbit-dot" cx="203" cy="155" r="3"/></svg><div class="balance-number">${money(totalUsdt())}</div><div class="balance-units">USDT <span>${totalTrx().toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2}).replace(',','.')} TRX</span></div><div class="balance-caption"><span class="signal-dot ${alive?'':'off'}"></span>${tronError()?'Нет ответа TronGrid':!d.subscribed?'Уведомления выключены':alive?'Бот активен':'Бот не проверял кошелёк'}<span>Обновлено ${time(d.now)}</span></div></section>
<section class="history-card"><div class="history-head"><h2>История</h2><button class="history-all" data-phone-page="transactions">Вся история</button></div>
${none || (list.length ? list.map(t => hRow(t)).join('') : '<p class="history-empty">Операций пока нет</p>')}</section>`;
  }

  // ---------- статистика выводов за неделю ----------
  const nice = v => { if (v <= 0) return 100; const e = 10 ** Math.floor(Math.log10(v)), m = v / e; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * e; };
  const kfmt = v => { const f = (x) => String(+x.toFixed(2)).replace('.', ','); return v >= 1e6 ? f(v / 1e6) + ' млн' : v >= 1000 ? f(v / 1000) + ' тыс' : String(Math.round(v)); };
  const PERIODS = { week: { n: 7, size: 1, title: 'неделю', chip: '7д' }, month: { n: 5, size: 6, title: '30 дней', chip: '30д' }, q: { n: 9, size: 10, title: '90 дней', chip: '90д' } };
  function periodStats(pid) {
    const P = PERIODS[pid], span = P.n * P.size, now = state.data.now;
    const ago = {}; for (let i = 0; i < span * 2; i++) ago[dayKey(now - i * DAY)] = i;
    const buckets = [...Array(P.n)].map((_, j) => { const first = (P.n - 1 - j) * P.size + P.size - 1; return { ts: now - first * DAY, end: now - (P.n - 1 - j) * P.size * DAY, sum: 0, n: 0 }; });
    let prev = 0, flagged = 0;
    for (const t of txs()) {
      if (t.type !== 'out') continue;
      const i = ago[dayKey(t.ts)]; if (i === undefined) continue;
      if (i < span) { const b = buckets[P.n - 1 - Math.floor(i / P.size)]; b.sum += t.amount; b.n++; if (t.flagged) flagged += t.amount; }
      else prev += t.amount;
    }
    return { P, buckets, total: buckets.reduce((s, b) => s + b.sum, 0), count: buckets.reduce((s, b) => s + b.n, 0), prev, flagged };
  }
  function weekCard() {
    const pid = state.wkp || 'week', w = periodStats(pid), B = w.buckets, max = Math.max(1e6, nice(Math.max(...B.map(b => b.sum))));
    const best = B.reduce((m, b, i) => b.sum > B[m].sum ? i : m, B.length - 1);
    const sel = Math.min(state.wk ?? best, B.length - 1), sd = B[sel];
    const pct = v => Math.max(0, Math.min(100, v / max * 100));
    const delta = w.prev > 0 ? Math.round((w.total - w.prev) / w.prev * 100) : null;
    const prevWord = { week: 'прошлой неделе', month: 'прошлым 30 дням', q: 'прошлым 90 дням' }[pid];
    const deltaHtml = delta === null ? `<span class="wk-delta">${w.count} ${plural(w.count,'вывод','вывода','выводов')} за ${w.P.title}</span>`
      : `<span class="wk-delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}"><b>${delta >= 200 ? '×' + (w.total / w.prev).toFixed(1).replace('.0','').replace('.',',') : (delta > 0 ? '+' : delta < 0 ? '−' : '') + Math.abs(delta) + '%'}</b> к ${prevWord}</span>`;
    const dm = ts => fmt(ts, { day: '2-digit', month: '2-digit' });
    const label = (b, i) => pid === 'week' ? (i === B.length - 1 ? 'Сг' : fmt(b.ts, { weekday: 'short' }).replace('.', '').slice(0, 2)) : pid === 'month' ? dm(b.ts) : (i % 3 === 2 ? dm(b.end) : '');
    const ticks = [1, .5, 0].map(f => `<span style="bottom:${f * 100}%">${kfmt(max * f)}</span>`).join('');
    const bars = B.map((b, i) => {
      const on = i === sel, desc = pid === 'week' ? fmt(b.ts,{day:'numeric',month:'long'}) : `${dm(b.ts)}–${dm(b.end)}`;
      return `<button class="wk-col ${on ? 'on' : ''}" data-wk="${i}" aria-label="${desc}: ${b.sum.toLocaleString('ru-RU')} USDT" aria-pressed="${on}"><span class="wk-wrap"><span class="wk-bar" style="height:${Math.max(pct(b.sum), 2.5)}%">${on ? `<span class="wk-tip">${money(b.sum)}</span>` : ''}</span></span><span class="wk-day">${label(b, i)}</span></button>`;
    }).join('');
    const chips = Object.entries(PERIODS).map(([id, P]) => `<button class="${id === pid ? 'on' : ''}" data-wkp="${id}" aria-pressed="${id === pid}">${P.chip}</button>`).join('');
    return `<section class="wk-card ${pid}">
<div class="wk-top"><span class="wk-icon">${icon('up')}</span><h2>Выводы</h2><div class="wk-chips" role="group" aria-label="Период">${chips}</div></div>
<div class="wk-mid"><div><div class="wk-total">${money(w.total)}<small>USDT</small></div>${deltaHtml}</div></div>
<div class="wk-chart"><div class="wk-axis">${ticks}</div><div class="wk-plot"><div class="wk-area"><span class="wk-grid" style="bottom:100%"></span><span class="wk-grid" style="bottom:50%"></span><span class="wk-grid base" style="bottom:0"></span><span class="wk-line" style="bottom:${pct(sd.sum)}%"></span></div><div class="wk-bars">${bars}</div></div></div>
</section>`;
  }

  function feed() {
    const all = txs().filter(t => state.filter === 'all' || t.type === state.filter);
    const list = all.slice(0, state.shown);
    const today = dayKey(state.data.now), yesterday = dayKey(state.data.now - DAY);
    const groups = [];
    for (const t of list) { const k = dayKey(t.ts); if (!groups.length || groups.at(-1).k !== k) groups.push({ k, ts: t.ts, items: [] }); groups.at(-1).items.push(t); }
    const html = groups.map(g => {
      const lbl = fmt(g.ts, {day:'numeric', month:'long'});
      const title = g.k === today ? 'Сегодня' : g.k === yesterday ? 'Вчера' : lbl;
      const sum = g.items.reduce((s, t) => s + (t.type === 'in' ? t.amount : -t.amount), 0);
      return `<section class="history-card"><div class="history-head"><h2>${title}</h2><span class="history-meta">${g.k === today || g.k === yesterday ? lbl : g.items.length + ' ' + plural(g.items.length,'операция','операции','операций')}</span></div>${g.items.map(t => hRow(t, true)).join('')}</section>`;
    }).join('');
    const f = (id, name) => `<button class="${state.filter===id?'selected':''}" data-filter="${id}">${name}</button>`;
    return `<div class="app-heading"><div><p class="phone-eyebrow">ВСЕ ОПЕРАЦИИ</p><h1>История</h1></div><button class="round-control" data-refresh aria-label="Обновить">${icon('refresh')}</button></div>
${weekCard()}
<div class="phone-filters" role="group" aria-label="Фильтр истории">${f('all','Все')}${f('in','Пополнения')}${f('out','Выводы')}</div>
${list.length ? `<div class="history-feed">${html}</div>` : empty('Здесь пока пусто')}
${all.length > state.shown ? '<button class="phone-ghost" data-more>Показать ещё</button>' : ''}
${state.data.truncated && all.length <= state.shown ? '<p class="settings-hint">Показаны последние 200 операций каждого кошелька.</p>' : ''}`;
  }

  const addForm = (kind) => `<form class="add-form" data-kind="${kind}"><label for="new-address">${kind === 'wallet' ? 'Адрес кошелька TRON' : 'Адрес TRON для контроля'}</label><input id="new-address" name="address" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="T…" maxlength="40" required><div><button type="button" class="phone-ghost" data-add-toggle>Отмена</button><button type="submit" class="phone-primary">${icon('check')}Добавить</button></div></form>`;
  const addButton = (kind, label, full, limit) => state.addOpen === kind ? addForm(kind)
    : full ? `<p class="settings-hint">Максимум ${limit}. Чтобы добавить новый, убери ненужный.</p>`
    : `<button class="phone-primary" data-add-toggle="${kind}">${icon('plus')}${label}</button>`;

  function walletsView() {
    const d = state.data, ws = d.wallets, lim = d.limits?.wallets || 5;
    const card = (w, i) => `<article class="address-card wallet-card"><div class="address-card-top"><span class="address-monogram">${String(i+1).padStart(2,'0')}</span><div><h2><button class="h-copy addr-copy" data-copy="${esc(w.address)}">${esc(short(w.address))}${icon('copy')}</button></h2><p>${w.error ? 'Нет ответа TronGrid' : (w.trx || 0).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2}).replace(',','.') + ' TRX'}</p></div><button class="tiny-icon" data-unwatch="${esc(w.address)}" aria-label="Убрать кошелёк ${esc(short(w.address))}">${icon('close')}</button></div><div class="address-card-bottom"><span>Баланс</span><strong>${w.error ? '—' : money(w.usdt)}<small>USDT</small></strong></div></article>`;
    return `<p class="seg-hint">Бот следит за этими кошельками и присылает тебе пополнения и выводы. Список видишь только ты.</p>
${ws.length ? `<div class="address-list">${ws.map(card).join('')}</div>` : empty('Кошельков нет. Добавь адрес кошелька TRON, за которым нужно следить.')}
${addButton('wallet', 'Добавить кошелёк', ws.length >= lim, `${lim} ${plural(lim,'кошелёк','кошелька','кошельков')}`)}`;
  }

  function flagsView() {
    const d = state.data, cutoff = d.now - 30 * DAY, all = txs(), lim = d.limits?.flags || 30;
    const stats = d.flagged.map(a => { const out = all.filter(t => t.flagged && t.who === a); const r = out.filter(t => t.ts >= cutoff); return { a, count: r.length, total: r.reduce((s, t) => s + t.amount, 0), last: out[0] }; });
    const total = stats.reduce((s, x) => s + x.total, 0);
    const lastOut = all.find(t => t.flagged);
    const n = d.flagged.length;
    return `<p class="seg-hint">Если с твоего кошелька выведут деньги на такой адрес, придёт отдельное уведомление 🚨. Список видишь только ты.</p>
${n ? `<section class="withdrawal-summary"><div class="phone-eyebrow">ВЫВОДЫ ЗА 30 ДНЕЙ</div><div class="withdrawal-total">${money(total)}<small>USDT</small></div>${spark(flaggedSeries(), true, 'Выводы на адреса под контролем за 7 дней')}<div class="summary-bottom"><span>На адреса под контролем</span>${icon('eye')}</div></section>
<div class="address-list">${stats.map((s, i) => `<article class="address-card"><div class="address-card-top"><span class="address-monogram">${String(i+1).padStart(2,'0')}</span><div><h2><button class="h-copy addr-copy" data-copy="${esc(s.a)}">${esc(short(s.a))}${icon('copy')}</button></h2><p>${s.last ? 'Последний вывод ' + fmt(s.last.ts,{day:'2-digit',month:'short'}) + ', ' + time(s.last.ts) : 'Выводов пока не было'}</p></div><button class="tiny-icon" data-unflag="${esc(s.a)}" aria-label="Убрать адрес ${esc(short(s.a))}">${icon('close')}</button></div><div class="address-card-bottom"><span>${s.count} ${plural(s.count,'операция','операции','операций')} за 30 дней</span><strong>${money(s.total)}<small>USDT</small></strong></div></article>`).join('')}</div>` : empty('Добавь адрес, и выводы на него будут приходить с 🚨')}
${lastOut ? `<div class="withdrawal-alert">${icon('alert')}<div><span>Последний вывод</span><strong>${amount('out', lastOut.amount)} <small>USDT</small></strong><p>${esc(short(lastOut.who))} · ${fmt(lastOut.ts,{day:'2-digit',month:'short'})}, ${time(lastOut.ts)}</p></div></div>` : ''}
${addButton('flag', 'Добавить адрес', n >= lim, `${lim} ${plural(lim,'адрес','адреса','адресов')}`)}`;
  }

  function addresses() {
    const d = state.data, seg = state.seg;
    const b = (id, name, n) => `<button class="${seg === id ? 'selected' : ''}" data-seg="${id}" aria-pressed="${seg === id}">${name}<span class="seg-n">${n}</span></button>`;
    return `<div class="app-heading"><div><p class="phone-eyebrow">ЧТО ОТСЛЕЖИВАЕТ БОТ</p><h1>Адреса</h1></div></div>
<div class="phone-filters addr-seg" role="group" aria-label="Раздел">${b('wallets', 'Кошельки', d.wallets.length)}${b('flags', 'Под контролем', d.flagged.length)}</div>
${seg === 'wallets' ? walletsView() : flagsView()}`;
  }

  function usersBlock() {
    const d = state.data; if (!d.isAdmin) return '';
    const owners = new Set((d.owners || []).map(String));
    const users = [...(d.users || [])];
    const rank = u => String(u.chat_id) === String(d.me) ? 0 : u.status === 'active' ? 1 : 2;
    users.sort((a, b) => rank(a) - rank(b));
    const statusText = { active: 'Активен', stopped: 'Отписался', blocked: 'Заблокировал' };
    const active = users.filter(u => u.status === 'active').length;
    const row = u => {
      const id = String(u.chat_id), me = id === String(d.me), open = state.user === id;
      const name = me ? 'Вы' : (u.name || 'Без имени'), ws = u.wallets || [];
      return `<div class="user-item ${open ? 'open' : ''}"><button class="recipient-row ${u.status!=='active'?'inactive':''}" data-user="${esc(id)}" aria-expanded="${open}"><span class="recipient-avatar">${esc(name.slice(0,1).toUpperCase())}</span><div><strong>${esc(name)}${owners.has(id) && !me ? ' 👑' : ''}</strong><span>${u.username ? '@' + esc(u.username) : esc(id)} · ${ws.length} ${plural(ws.length,'кошелёк','кошелька','кошельков')} · 🚨 ${u.flags || 0}</span></div><span class="recipient-status">${statusText[u.status] || 'Активен'}</span></button>${open ? `<div class="user-more">${ws.length ? ws.map(a => `<button class="h-copy" data-copy="${esc(a)}">${esc(short(a))}${icon('copy')}</button>`).join('') : '<span>Кошельков нет</span>'}<span>С нами с ${u.joined_at ? fmt(Date.parse(u.joined_at), {day:'2-digit', month:'short', year:'numeric'}) : '—'} · id ${esc(id)}</span></div>` : ''}</div>`;
    };
    const c = d.counts || {};
    return `<div class="phone-section-heading"><h2>Пользователи</h2><span>${active} из ${users.length} активны</span></div>
<p class="seg-hint admin-hint">👑 Этот раздел видишь только ты. Кошельков под наблюдением: ${c.wallets ?? 0}.</p>
<div class="recipients-card">${users.length ? users.map(row).join('') : '<p class="history-empty">Пока никого</p>'}</div>`;
  }

  function settings() {
    const d = state.data, s = d.settings;
    const max = Math.max(1000, Math.ceil(s.min_amount / 100) * 100);
    const toggle = (key, label, on = s[key], attr = `data-setting="${key}"`) => `<label class="toggle-row"><span>${label}</span><input type="checkbox" role="switch" ${attr} aria-label="${label}" ${on?'checked':''}><span class="switch-track" aria-hidden="true"></span></label>`;
    const alive = botAlive();
    return `<div class="app-heading"><div><p class="phone-eyebrow">ТВОИ ПАРАМЕТРЫ</p><h1>Настройки</h1></div></div>
<div class="phone-appearance-heading"><h2>Оформление</h2><span>На этом устройстве</span></div><section class="phone-appearance">${TronAppearance.controls(true)}</section>
<div class="phone-section-heading"><h2>Уведомления</h2></div><div class="notification-card">${toggle('subscribed', 'Присылать в Telegram', d.subscribed, 'data-subscribe')}${d.subscribed ? toggle('notify_in','Пополнения') + toggle('notify_out','Выводы') + toggle('notify_flagged','Адреса под контролем 🚨') : ''}</div>
${d.subscribed ? `<p class="settings-hint">Выводы на адреса под контролем приходят всегда, даже ниже порога.</p>
<div class="phone-section-heading"><h2>Порог уведомлений</h2></div><section class="threshold-card"><span class="phone-eyebrow">МИНИМАЛЬНАЯ СУММА</span><div class="threshold-value"><output>${s.min_amount}</output><small>USDT</small></div><input type="range" min="0" max="${max}" step="10" value="${s.min_amount}" data-threshold aria-label="Минимальная сумма USDT" style="--range:${s.min_amount / max * 100}%"><div class="range-labels"><span>0 USDT</span><span>${money(max)} USDT</span></div></section>`
  : '<p class="settings-hint">Уведомления выключены. Кошельки и адреса сохранены, включить можно в любой момент.</p>'}
${usersBlock()}
<section class="bot-card"><span class="bot-icon">${icon(alive?'check':'alert')}</span><div><strong>${alive?'Бот активен':'Бот не отвечает'}</strong><span>${d.meta?.last_poll ? 'Последняя проверка ' + time(d.meta.last_poll * 1000) : 'Проверок ещё не было'}</span></div><span class="signal-dot ${alive?'':'off'}"></span></section>`;
  }

  function splash() {
    if (state.status === 'loading') return `<div class="app-splash"><span class="coin-glyph">₮</span><p>Загрузка…</p></div>`;
    const text = !initData ? 'Откройте приложение из Telegram: кнопка меню в чате с ботом.' : state.code === 401 ? 'Сессия устарела. Закройте и откройте приложение заново.' : esc(state.error) || 'Не удалось загрузить данные.';
    return `<div class="app-splash"><span class="coin-glyph">₮</span><p>${text}</p>${initData && state.code !== 401 ? '<button class="phone-primary" data-retry>Повторить</button>' : ''}</div>`;
  }

  const nav = () => `<nav class="phone-nav" aria-label="Разделы">${[['home','home','Главная'],['transactions','clock','История'],['addresses','user','Адреса'],['settings','settings','Настройки']].map(([id,i,n])=>`<button class="phone-tab ${state.tab===id?'active':''}" data-phone-page="${id}" ${state.tab===id?'aria-current="page"':''}>${icon(i)}<span>${n}</span></button>`).join('')}</nav>`;

  function render(keepScroll = true) {
    const prev = document.getElementById('content');
    const top = prev && keepScroll ? prev.scrollTop : 0;
    const ready = state.status === 'ok' && state.data;
    const inner = ready ? ({ home, transactions: feed, addresses, settings })[state.tab]() : splash();
    root.innerHTML = `<div class="phone" data-screen="${state.tab}"><div class="phone-content ${state.tab}" id="content">${inner}</div>${ready ? nav() : ''}<div class="phone-toast" role="status"></div></div>`;
    document.getElementById('content').scrollTop = top;
    if (Date.now() < toastUntil) { const t = root.querySelector('.phone-toast'); t.textContent = toastMsg; t.classList.add('visible'); }
    const input = root.querySelector('#new-address'); if (input) input.focus();
  }

  // всплывашка переживает перерисовку экрана
  let toastTimer, toastMsg = '', toastUntil = 0;
  function toast(msg) {
    toastMsg = msg; toastUntil = Date.now() + 3200;
    const t = root.querySelector('.phone-toast'); if (!t) return;
    t.textContent = msg; t.classList.add('visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => root.querySelector('.phone-toast')?.classList.remove('visible'), 3200);
  }
  const confirmBox = (msg) => new Promise(res => { if (tg?.showConfirm && tg.isVersionAtLeast?.('6.2')) tg.showConfirm(msg, ok => res(ok)); else res(window.confirm(msg)); });
  const haptic = (kind = 'light') => { try { tg?.HapticFeedback?.impactOccurred(kind); } catch {} };

  // ---------- действия ----------
  root.addEventListener('click', async e => {
    const el = e.target.closest('button, [data-copy], [data-open]'); if (!el) return;
    if (el.dataset.phonePage) { state.tab = el.dataset.phonePage; state.addOpen = false; state.open = ''; state.user = ''; haptic(); render(false); return; }
    if ('gotoWallets' in el.dataset) { state.tab = 'addresses'; state.seg = 'wallets'; state.addOpen = 'wallet'; haptic(); render(false); return; }
    if (el.dataset.seg) { state.seg = el.dataset.seg; state.addOpen = false; haptic(); render(false); return; }
    if (el.dataset.user) { state.user = state.user === el.dataset.user ? '' : el.dataset.user; haptic(); render(); return; }
    if (el.dataset.copy) { const a = el.dataset.copy; try { await navigator.clipboard.writeText(a); toast('Адрес скопирован'); } catch { toast(a); } return; }
    if (el.dataset.open) { if (tg?.openLink) tg.openLink(el.dataset.open); else window.open(el.dataset.open, '_blank', 'noopener'); return; }
    if (el.dataset.filter) { state.filter = el.dataset.filter; state.shown = 40; render(false); return; }
    if ('more' in el.dataset) { state.shown += 40; render(); return; }
    if ('refresh' in el.dataset) { load(true); return; }
    if ('retry' in el.dataset) { state.status = 'loading'; render(); load(); return; }
    if (el.dataset.wkp) { state.wkp = el.dataset.wkp; state.wk = null; haptic('light'); render(); return; }
    if (el.dataset.wk) { state.wk = Number(el.dataset.wk); haptic('light'); render(); return; }
    if (el.dataset.row) { state.open = state.open === el.dataset.row ? '' : el.dataset.row; haptic(); render(); return; }
    if ('addToggle' in el.dataset) { state.addOpen = el.dataset.addToggle || false; render(); return; }
    if (el.dataset.unflag) {
      const a = el.dataset.unflag;
      if (!(await confirmBox(`Убрать ${short(a)} из отслеживаемых?`))) return;
      try { const r = await call('flag_remove', { address: a }); state.data.flagged = r.flagged; haptic('medium'); render(); toast('Адрес убран'); }
      catch (err) { toast(err.message); }
      return;
    }
    if (el.dataset.unwatch) {
      const a = el.dataset.unwatch;
      if (!(await confirmBox(`Перестать следить за кошельком ${short(a)}? Уведомления по нему приходить не будут.`))) return;
      try {
        await call('wallet_remove', { address: a });
        state.data.wallets = state.data.wallets.filter(w => w.address !== a);
        state.data.transfers = state.data.transfers.filter(t => t.wallet !== a);
        haptic('medium'); render(); toast('Кошелёк убран');
      } catch (err) { toast(err.message); }
    }
  });

  root.addEventListener('submit', async e => {
    if (!e.target.matches('.add-form')) return;
    e.preventDefault();
    const btn = e.target.querySelector('[type=submit]'); btn.disabled = true;
    const address = e.target.address.value.trim(), kind = e.target.dataset.kind;
    try {
      if (kind === 'wallet') {
        const r = await call('wallet_add', { address });
        state.addOpen = false; haptic('medium');
        toast(r.added ? 'Кошелёк добавлен' : 'Этот кошелёк уже в списке');
        await load();
      } else {
        const r = await call('flag_add', { address });
        state.data.flagged = r.flagged; state.addOpen = false; haptic('medium'); render();
        toast(r.added ? 'Адрес добавлен. Выводы на него придут с 🚨' : 'Этот адрес уже в списке');
      }
    } catch (err) { btn.disabled = false; toast(err.message); }
  });

  async function saveSettings(patch) {
    try { const r = await call('set_settings', { settings: patch }); state.data.settings = r.settings; toast('Сохранено'); }
    catch (err) { toast(err.message); load(); }
  }
  root.addEventListener('input', e => {
    if (!e.target.matches('[data-threshold]')) return;
    const i = e.target; i.style.setProperty('--range', i.value / i.max * 100 + '%');
    i.closest('.threshold-card').querySelector('output').textContent = i.value;
  });
  root.addEventListener('change', e => {
    const i = e.target;
    if (i.matches('[data-threshold]')) saveSettings({ min_amount: Number(i.value) });
    else if (i.dataset.setting) saveSettings({ [i.dataset.setting]: i.checked });
    else if ('subscribe' in i.dataset) {
      call('subscribe', { on: i.checked })
        .then(r => { state.data.subscribed = r.subscribed; render(); toast(r.subscribed ? 'Уведомления включены' : 'Уведомления выключены'); })
        .catch(err => { toast(err.message); load(); });
    }
  });
  // тема/фон меняются в appearance.js; перерисовка не нужна, только обновить выделение
  document.addEventListener('mineral-appearance-change', () => TronAppearance.updateControls());

  // автообновление раз в минуту, пока приложение открыто
  setInterval(() => { if (!document.hidden && state.status === 'ok') load(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && state.status === 'ok') load(); });

  render();
  if (initData && API) load(); else { state.status = 'error'; render(); }
})();
