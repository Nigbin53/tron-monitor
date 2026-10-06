/* TRON Monitor — рабочее мини-приложение. Данные приходят из функции bot в Supabase,
   доступ проверяется по подписи Telegram и chat_id владельца. */
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
    check:'<path d="m5 12 4 4L19 6"/>',
    eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
    close:'<path d="m6 6 12 12M6 18 18 6"/>',
    refresh:'<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'
  };
  const icon = (n, cls='') => `<svg class="line-icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[n]}</svg>`;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const short = a => !a ? '' : a.length > 12 ? `${a.slice(0,6)}…${a.slice(-4)}` : a;
  const money = n => { const [i,f] = Math.abs(Number(n)||0).toFixed(2).split('.'); return i.replace(/\B(?=(\d{3})+(?!\d))/g,' ') + (f==='00' ? '' : `<span class="cents">.${f}</span>`); };
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
  const state = { tab: 'home', data: null, status: 'loading', error: '', code: 0, filter: 'all', shown: 40, addOpen: false };
  const root = document.getElementById('root');

  async function call(op, extra = {}) {
    // text/plain — чтобы браузер не делал лишний предварительный CORS-запрос
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify({ initData, op, ...extra }) });
    let j = {}; try { j = await r.json(); } catch {}
    if (!r.ok) throw Object.assign(new Error(j.error || `Ошибка сервера (${r.status})`), { status: r.status });
    return j;
  }

  let loading = false;
  async function load(manual = false) {
    if (loading) return; loading = true;
    if (manual) toast('Обновляю…');
    try {
      state.data = await call('overview');
      state.status = 'ok';
      if (manual) toast('Обновлено');
    } catch (e) {
      if (!state.data) { state.status = 'error'; state.error = e.message; state.code = e.status || 0; }
      else toast('Не удалось обновить: ' + e.message);
    } finally { loading = false; render(); }
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
  const miniCard = t => `<div class="mini-transaction"><span class="direction ${t.type}">${icon(t.type==='in'?'down':'up')}</span><div><strong>${t.type==='in'?'Пополнение':'Вывод'}${t.flagged?'<span class="watch-mini">'+icon('alert')+'</span>':''}</strong><span>${when(t.ts)} · ${esc(short(t.who))}</span></div><span class="mini-amount">${amount(t.type,t.amount)}</span></div>`;
  const card = t => `<article class="transaction-card ${t.flagged?'watched':''}" data-direction="${t.type}"><div class="transaction-top"><span class="direction ${t.type}">${icon(t.type==='in'?'down':'up')}</span><span>${t.type==='in'?'Пополнение':'Вывод'}</span><time>${time(t.ts)}</time></div><div class="transaction-amount">${amount(t.type,t.amount)}<small>USDT</small></div><button class="transaction-address as-link" data-copy="${esc(t.who)}" aria-label="Скопировать адрес">${t.type==='in'?'От ':'Куда '}${esc(short(t.who))}</button>${t.flagged?`<div class="watch-label">${icon('alert')}Отслеживаемый адрес</div>`:''}<div class="transaction-bottom"><span>Остаток после операции</span><strong>${money(t.balance)} <small>USDT</small></strong></div><button class="scan-button" data-open="${scanUrl(t.id)}">Открыть в TronScan ${icon('arrow')}</button></article>`;
  const empty = text => `<div class="app-empty">${text}</div>`;

  // ---------- экраны ----------
  function home() {
    const d = state.data, list = txs().slice(0, 5), alive = botAlive();
    return `<div class="app-heading"><div><p class="phone-eyebrow">ВАШ КОШЕЛЁК</p><h1>Обзор</h1></div><span class="protocol-pill">TRC20</span></div>
<section class="balance-card"><div class="balance-top"><span class="coin-glyph">₮</span><span>Общий баланс</span><span class="balance-network">TRON</span></div><svg class="balance-orbit" viewBox="0 0 220 220" aria-hidden="true"><circle cx="110" cy="110" r="103"/><path d="M39 184A103 103 0 1 1 203 155"/><circle class="orbit-dot" cx="203" cy="155" r="3"/></svg><div class="balance-number">${money(totalUsdt())}</div><div class="balance-units">USDT <span>${totalTrx().toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2}).replace(',','.')} TRX</span></div><div class="balance-caption"><span class="signal-dot ${alive?'':'off'}"></span>${tronError()?'Нет ответа TronGrid':alive?'Бот активен':'Бот не проверял кошелёк'}<span>Обновлено ${time(d.now)}</span></div></section>
${d.wallets.map(w => `<button class="wallet-address" data-copy="${esc(w.address)}"><span><small>АДРЕС КОШЕЛЬКА</small>${esc(short(w.address))}</span>${icon('copy')}</button>`).join('')}
<section class="balance-chart"><div><span class="phone-eyebrow">ДИНАМИКА БАЛАНСА</span><small>7 дней</small></div>${spark(balanceSeries())}</section>
<div class="phone-section-heading"><h2>Последние операции</h2><span>${fmt(d.now,{day:'2-digit',month:'short'})}</span></div>
${list.length ? `<section class="mini-transactions">${list.map(miniCard).join('')}</section><button class="phone-ghost" data-phone-page="transactions">Вся лента</button>` : empty('Операций пока нет')}`;
  }

  function feed() {
    const all = txs().filter(t => state.filter === 'all' || t.type === state.filter);
    const list = all.slice(0, state.shown);
    const today = dayKey(state.data.now), yesterday = dayKey(state.data.now - DAY);
    let html = '', lastDay = '';
    for (const t of list) {
      const k = dayKey(t.ts);
      if (k !== lastDay) { lastDay = k; const lbl = dayLong(t.ts); html += `<div class="day-label">${k===today?`СЕГОДНЯ <span>${lbl}</span>`:k===yesterday?`ВЧЕРА <span>${lbl}</span>`:lbl}</div>`; }
      html += card(t);
    }
    const f = (id, name) => `<button class="${state.filter===id?'selected':''}" data-filter="${id}">${name}</button>`;
    return `<div class="app-heading"><div><p class="phone-eyebrow">ИСТОРИЯ КОШЕЛЬКА</p><h1>Транзакции</h1></div><button class="round-control" data-refresh aria-label="Обновить">${icon('refresh')}</button></div>
<div class="phone-filters" role="group" aria-label="Фильтр транзакций">${f('all','Все')}${f('in','Входящие')}${f('out','Исходящие')}</div>
${list.length ? `<div class="transaction-feed">${html}</div>` : empty('Здесь пока пусто')}
${all.length > state.shown ? '<button class="phone-ghost" data-more>Показать ещё</button>' : ''}
${state.data.truncated && all.length <= state.shown ? '<p class="settings-hint">Показаны последние 200 операций каждого кошелька.</p>' : ''}`;
  }

  function addresses() {
    const d = state.data, cutoff = d.now - 30 * DAY, all = txs();
    const stats = d.flagged.map(a => { const out = all.filter(t => t.flagged && t.who === a); const r = out.filter(t => t.ts >= cutoff); return { a, count: r.length, total: r.reduce((s, t) => s + t.amount, 0), last: out[0] }; });
    const total = stats.reduce((s, x) => s + x.total, 0);
    const lastOut = all.find(t => t.flagged);
    const n = d.flagged.length;
    return `<div class="app-heading"><div><p class="phone-eyebrow">КОНТРОЛЬ ВЫВОДОВ</p><h1>Адреса</h1></div><span class="protocol-pill">${n} ${plural(n,'адрес','адреса','адресов')}</span></div>
<section class="withdrawal-summary"><div class="phone-eyebrow">ВЫВОДЫ ЗА 30 ДНЕЙ</div><div class="withdrawal-total">${money(total)}<small>USDT</small></div>${spark(flaggedSeries(), true, 'Выводы на отслеживаемые адреса за 7 дней')}<div class="summary-bottom"><span>На отслеживаемые адреса</span>${icon('eye')}</div></section>
<div class="phone-section-heading"><h2>Список адресов</h2><span>Всего ${n}</span></div>
${n ? `<div class="address-list">${stats.map((s, i) => `<article class="address-card"><div class="address-card-top"><span class="address-monogram">${String(i+1).padStart(2,'0')}</span><div><h2>${esc(short(s.a))}</h2><p>${s.last ? 'Последний вывод ' + fmt(s.last.ts,{day:'2-digit',month:'short'}) + ', ' + time(s.last.ts) : 'Выводов пока не было'}</p></div><button class="tiny-icon" data-unflag="${esc(s.a)}" aria-label="Убрать адрес ${esc(short(s.a))}">${icon('close')}</button></div><div class="address-card-bottom"><span>${s.count} ${plural(s.count,'операция','операции','операций')} за 30 дней</span><strong>${money(s.total)}<small>USDT</small></strong></div></article>`).join('')}</div>` : empty('Добавь адрес, и выводы на него будут приходить с 🚨')}
${lastOut ? `<div class="withdrawal-alert">${icon('alert')}<div><span>Последний вывод</span><strong>${amount('out', lastOut.amount)} <small>USDT</small></strong><p>${esc(short(lastOut.who))} · ${fmt(lastOut.ts,{day:'2-digit',month:'short'})}, ${time(lastOut.ts)}</p></div></div>` : ''}
${state.addOpen ? `<form class="add-form"><label for="new-address">Адрес TRON</label><input id="new-address" name="address" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="T…" maxlength="40" required><div><button type="button" class="phone-ghost" data-add-toggle>Отмена</button><button type="submit" class="phone-primary">${icon('check')}Добавить</button></div></form>` : `<button class="phone-primary" data-add-toggle>${icon('plus')}Добавить адрес</button>`}`;
  }

  function settings() {
    const d = state.data, s = d.settings, owners = new Set(d.owners.map(String));
    const max = Math.max(1000, Math.ceil(s.min_amount / 100) * 100);
    const users = [...d.users];
    for (const o of owners) if (!users.some(u => String(u.chat_id) === o)) users.unshift({ chat_id: o, name: '', status: 'active' });
    const rank = u => owners.has(String(u.chat_id)) ? 0 : u.status === 'active' ? 1 : 2;
    users.sort((a, b) => rank(a) - rank(b));
    const statusText = { active: 'Активен', stopped: 'Отписался', blocked: 'Заблокировал' };
    const toggle = (key, label) => `<label class="toggle-row"><span>${label}</span><input type="checkbox" role="switch" data-setting="${key}" aria-label="${label}" ${s[key]?'checked':''}><span class="switch-track" aria-hidden="true"></span></label>`;
    const active = users.filter(u => u.status === 'active').length;
    const alive = botAlive();
    return `<div class="app-heading"><div><p class="phone-eyebrow">ПАРАМЕТРЫ МОНИТОРИНГА</p><h1>Настройки</h1></div></div>
<div class="phone-appearance-heading"><h2>Оформление</h2><span>На этом устройстве</span></div><section class="phone-appearance">${TronAppearance.controls(true)}</section>
<div class="phone-section-heading"><h2>Порог уведомлений</h2></div><section class="threshold-card"><span class="phone-eyebrow">МИНИМАЛЬНАЯ СУММА</span><div class="threshold-value"><output>${s.min_amount}</output><small>USDT</small></div><input type="range" min="0" max="${max}" step="10" value="${s.min_amount}" data-threshold aria-label="Минимальная сумма USDT" style="--range:${s.min_amount / max * 100}%"><div class="range-labels"><span>0 USDT</span><span>${money(max)} USDT</span></div></section>
<div class="phone-section-heading"><h2>Уведомления</h2></div><div class="notification-card">${toggle('notify_in','Пополнения')}${toggle('notify_out','Выводы')}${toggle('notify_flagged','Отслеживаемые адреса 🚨')}</div>
<p class="settings-hint">Выводы на отслеживаемые адреса приходят всегда, даже ниже порога.</p>
<div class="phone-section-heading"><h2>Получатели</h2><span>${active} ${plural(active,'человек','человека','человек')}</span></div>
<div class="recipients-card">${users.map(u => { const name = owners.has(String(u.chat_id)) ? 'Вы' : (u.name || 'Без имени'); return `<div class="recipient-row ${u.status!=='active'?'inactive':''}"><span class="recipient-avatar">${esc(name.slice(0,1).toUpperCase())}</span><div><strong>${esc(name)}</strong><span>${u.username ? '@' + esc(u.username) : esc(u.chat_id)}</span></div><span class="recipient-status">${statusText[u.status] || 'Активен'}</span></div>`; }).join('')}<button class="add-recipient" data-hint="Чтобы добавить получателя, пусть он откроет бота и напишет /start">${icon('plus')}Добавить получателя</button></div>
<section class="bot-card"><span class="bot-icon">${icon(alive?'check':'alert')}</span><div><strong>${alive?'Бот активен':'Бот не отвечает'}</strong><span>${d.meta?.last_poll ? 'Последняя проверка ' + time(d.meta.last_poll * 1000) : 'Проверок ещё не было'}</span></div><span class="signal-dot ${alive?'':'off'}"></span></section>`;
  }

  function splash() {
    if (state.status === 'loading') return `<div class="app-splash"><span class="coin-glyph">₮</span><p>Загрузка…</p></div>`;
    const text = !initData ? 'Откройте приложение из Telegram: кнопка меню в чате с ботом.' : state.code === 403 ? 'Приложение доступно только владельцу бота.' : esc(state.error) || 'Не удалось загрузить данные.';
    return `<div class="app-splash"><span class="coin-glyph">₮</span><p>${text}</p>${initData && state.code !== 403 ? '<button class="phone-primary" data-retry>Повторить</button>' : ''}</div>`;
  }

  const nav = () => `<nav class="phone-nav" aria-label="Разделы">${[['home','home','Главная'],['transactions','list','Лента'],['addresses','user','Адреса'],['settings','settings','Настройки']].map(([id,i,n])=>`<button class="phone-tab ${state.tab===id?'active':''}" data-phone-page="${id}" ${state.tab===id?'aria-current="page"':''}>${icon(i)}<span>${n}</span></button>`).join('')}</nav>`;

  function render(keepScroll = true) {
    const prev = document.getElementById('content');
    const top = prev && keepScroll ? prev.scrollTop : 0;
    const ready = state.status === 'ok' && state.data;
    const inner = ready ? ({ home, transactions: feed, addresses, settings })[state.tab]() : splash();
    root.innerHTML = `<div class="phone" data-screen="${state.tab}"><div class="phone-content ${state.tab}" id="content">${inner}</div>${ready ? nav() : ''}<div class="phone-toast" role="status"></div></div>`;
    document.getElementById('content').scrollTop = top;
    const input = root.querySelector('#new-address'); if (input) input.focus();
  }

  let toastTimer;
  function toast(msg) {
    const t = root.querySelector('.phone-toast'); if (!t) return;
    t.textContent = msg; t.classList.add('visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('visible'), 3200);
  }
  const confirmBox = (msg) => new Promise(res => { if (tg?.showConfirm && tg.isVersionAtLeast?.('6.2')) tg.showConfirm(msg, ok => res(ok)); else res(window.confirm(msg)); });
  const haptic = (kind = 'light') => { try { tg?.HapticFeedback?.impactOccurred(kind); } catch {} };

  // ---------- действия ----------
  root.addEventListener('click', async e => {
    const el = e.target.closest('button, [data-copy], [data-open]'); if (!el) return;
    if (el.dataset.phonePage) { state.tab = el.dataset.phonePage; state.addOpen = false; haptic(); render(false); return; }
    if (el.dataset.copy) { const a = el.dataset.copy; try { await navigator.clipboard.writeText(a); toast('Адрес скопирован'); } catch { toast(a); } return; }
    if (el.dataset.open) { if (tg?.openLink) tg.openLink(el.dataset.open); else window.open(el.dataset.open, '_blank', 'noopener'); return; }
    if (el.dataset.filter) { state.filter = el.dataset.filter; state.shown = 40; render(false); return; }
    if ('more' in el.dataset) { state.shown += 40; render(); return; }
    if ('refresh' in el.dataset) { load(true); return; }
    if ('retry' in el.dataset) { state.status = 'loading'; render(); load(); return; }
    if ('addToggle' in el.dataset) { state.addOpen = !state.addOpen; render(); return; }
    if (el.dataset.hint) { toast(el.dataset.hint); return; }
    if (el.dataset.unflag) {
      const a = el.dataset.unflag;
      if (!(await confirmBox(`Убрать ${short(a)} из отслеживаемых?`))) return;
      try { const r = await call('flag_remove', { address: a }); state.data.flagged = r.flagged; haptic('medium'); render(); toast('Адрес убран'); }
      catch (err) { toast(err.message); }
    }
  });

  root.addEventListener('submit', async e => {
    if (!e.target.matches('.add-form')) return;
    e.preventDefault();
    const btn = e.target.querySelector('[type=submit]'); btn.disabled = true;
    const address = e.target.address.value.trim();
    try {
      const r = await call('flag_add', { address });
      state.data.flagged = r.flagged; state.addOpen = false; haptic('medium'); render();
      toast(r.added ? 'Адрес добавлен. Выводы на него придут с 🚨' : 'Этот адрес уже в списке');
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
  });
  // тема/фон меняются в appearance.js; перерисовка не нужна, только обновить выделение
  document.addEventListener('mineral-appearance-change', () => TronAppearance.updateControls());

  // автообновление раз в минуту, пока приложение открыто
  setInterval(() => { if (!document.hidden && state.status === 'ok') load(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && state.status === 'ok') load(); });

  render();
  if (initData && API) load(); else { state.status = 'error'; render(); }
})();
