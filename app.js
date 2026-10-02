'use strict';
// 画面と操作。計算は logic.js、記録は localStorage の 'itpass:v1' だけ。
// 試験（apptest/ui_tests.js）から中身を見るため、状態は var で置く。
var KEY = 'itpass:v1';
var LETTERS = ['ア', 'イ', 'ウ', 'エ'];
var FIELD_NAME = { S: 'ストラテジ系', M: 'マネジメント系', T: 'テクノロジ系' };
var DB = null;
var st = newState();
var round = null;
var canSave = true;

function $(sel) { return document.querySelector(sel); }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function rich(s) { return esc(s).replace(/__(.+?)__/g, '<u>$1</u>').replace(/~~(.+?)~~/g, '<u class="dash">$1</u>'); }   // __主キー__ は下線、~~外部キー~~ は破線の下線
function today() { return ymd(new Date()); }
function allIds() { return DB.questions.map(q => q.id); }
function remaining() { return remainingCount(st, DB.main.concat(DB.extra)); }
function inField(f) { return id => DB.byId[id].field === f; }

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.v === 1) st = Object.assign(newState(), s);
  } catch (e) { canSave = false; }
}

function save() {
  if (!canSave) return;
  try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { canSave = false; }
}

function index(data) {
  const qs = data.questions;
  const ids = kind => qs.filter(q => q.set === kind).map(q => q.id);
  return { version: data.version, questions: qs, byId: Object.fromEntries(qs.map(q => [q.id, q])),
           main: ids('300'), extra: ids('ai'), r08: ids('r08') };
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('on'), 2200);
}

// ---------------------------------------------------------------- ホーム
function home() {
  round = null;
  const rem = remaining();
  const day = rollDay(st, today(), rem);
  const t = calcTarget(st.examDate, today(), rem);
  if (t && day.target === null) retarget(st, today(), rem);
  save();
  const s = fieldStats(st, DB.questions);
  const pct = k => s[k].n ? Math.round(100 * s[k].ok / s[k].n) + '<small>%</small>' : '—';
  const wrongN = pickWrong(st, allIds(), Infinity).length;
  const aiNew = DB.extra.filter(id => status(st, id) === 'new').length;
  $('#v').innerHTML = (t ? `
    <section class="card quota${day.cleared ? ' done' : ''}">
      <div class="qhead"><h2>今日のノルマ</h2>${day.cleared ? '<span class="clear">クリア</span>' : ''}</div>
      <div class="big"><b>${day.done}</b> / ${day.target}問</div>
      <div class="bar"><i style="width:${Math.min(100, 100 * day.done / day.target)}%"></i></div>
      <p class="sub">受験日まであと${t.daysLeft}日・残り${rem}問</p>
    </section>` : `
    <section class="card">
      <h2>受験日を入れてください</h2>
      <p class="sub">受験日から、1日に解く問題の数を計算します。</p>
      <div class="row"><input type="date" id="exam" value="${esc(st.examDate || '')}"><button class="btn" data-act="examSet">決定</button></div>
    </section>`) + `
    <button class="btn primary big" data-act="go">おまかせ10問</button>
    <section class="card">
      <h2>正答率</h2>
      <div class="stats">
        <div><span>ストラテジ</span><b>${pct('S')}</b></div><div><span>マネジメント</span><b>${pct('M')}</b></div>
        <div><span>テクノロジ</span><b>${pct('T')}</b></div><div><span>総合</span><b>${pct('all')}</b></div>
      </div>
      <p class="note">合格の目安：総合6割以上、かつ各分野3割以上（本番は問題ごとに配点が違うので目安です）</p>
    </section>
    <nav class="card menu">
      <button data-act="fields">分野別に解く<span>›</span></button>
      <div class="fields" id="fields" hidden>
        <button class="btn" data-act="field" data-arg="S">ストラテジ</button>
        <button class="btn" data-act="field" data-arg="M">マネジメント</button>
        <button class="btn" data-act="field" data-arg="T">テクノロジ</button>
      </div>
      <button data-act="wrong">間違えた問題<span>${wrongN}</span></button>
      <button data-act="ai">AI作成問題<span>未回答 ${aiNew}</span></button>
      <button data-act="r08">令和8年度（模試用）<span>${st.r08ok ? `続き 問${Math.min(st.r08, 100)}` : '鍵'}</span></button>
    </nav>
    ${t ? `<section class="card"><h2>受験日</h2><div class="row"><input type="date" id="exam" value="${esc(st.examDate)}"><button class="btn" data-act="examSet">変更</button></div></section>` : ''}
    ${canSave ? '' : '<p class="note">このブラウザでは記録を保存できません（プライベートブラウズなど）。</p>'}
    <footer><button data-act="about">このアプリについて</button></footer>`;
  window.scrollTo(0, 0);
}

function setExam() {
  const v = $('#exam').value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || daysBetween(today(), v) <= 0) return toast('明日以降の日付を入れてください');
  st.examDate = v;
  retarget(st, today(), remaining());
  save();
  home();
}

// ---------------------------------------------------------------- 出題
function startRound(ids, label, mode, arg) {
  if (!ids.length) return toast(mode === 'wrong' ? '間違えた問題はありません' : '出せる問題がありません');
  round = { ids, i: 0, res: [], label, mode, arg };
  showQ();
}

function startR08() {
  const ids = DB.r08.slice(st.r08 - 1, st.r08 - 1 + 10);
  if (!ids.length) {
    st.r08 = 1;
    save();
    return toast('令和8年度は最後まで解きました。次は問1からです');
  }
  startRound(ids, '令和8年度', 'r08');
}

function r08Gate() {
  $('#v').innerHTML = `
    <section class="card">
      <h2>令和8年度は模試用です</h2>
      <p>本番の前に、120分を計って通しで解く模試として取ってあります。先に解くと、力試しになりません。</p>
      <button class="btn primary" data-act="r08yes">それでも解く</button>
      <button class="btn" data-act="home">やめる</button>
    </section>`;
  window.scrollTo(0, 0);
}

function block(b) {
  switch (b.t) {
    case 'p': return `<p>${rich(b.v).replace(/\n/g, '<br>')}</p>`;
    case 'list': return `<ul class="items">${b.v.map(x => `<li>${rich(x)}</li>`).join('')}</ul>`;
    case 'table': return `<div class="tw"><table>${b.v.map((r, i) =>
      `<tr>${r.map(c => i === 0 && b.head ? `<th>${rich(c)}</th>` : `<td>${rich(c)}</td>`).join('')}</tr>`).join('')}</table></div>`;
    case 'img': return `<img class="fig" src="${esc(b.v)}" alt="図">`;
    case 'code': return `<pre>${esc(b.v)}</pre>`;
    case 'html': return `<div class="html">${b.v}</div>`;
    default: return '';
  }
}

function showQ() {
  const q = DB.byId[round.ids[round.i]];
  const text = q.body !== null;
  const layout = !q.choices ? 'grid4' : q.choices.every(c => c.replace(/__/g, '').length <= 14) ? 'grid2' : 'list';
  $('#v').innerHTML = `
    <div class="qbar"><button class="x" data-act="home" aria-label="やめる">×</button>
      <span class="pos">${round.i + 1} / ${round.ids.length}</span><span class="src">${esc(q.source)}</span></div>
    <article class="q${text ? '' : ' pic'}">
      ${text ? q.body.map(block).join('') : `<img class="orig" src="${esc(q.original)}" alt="問題（冊子の画像）">`}
      ${text && q.original ? `<details class="origbox"><summary>原本を見る</summary><img src="${esc(q.original)}" loading="lazy" alt="冊子の画像"></details>` : ''}
    </article>
    <div class="choices ${layout}">${LETTERS.map((L, i) =>
      `<button class="ch" data-act="choose" data-arg="${i}"><b>${L}</b>${q.choices ? `<span>${rich(q.choices[i])}</span>` : ''}</button>`).join('')}</div>
    <div id="after"></div>`;
  window.scrollTo(0, 0);
}

function answer(i) {
  if (round.res.length > round.i) return;                                // 二度押し
  const q = DB.byId[round.ids[round.i]];
  const ok = LETTERS[i] === q.answer;
  const cleared = recordAnswer(st, q.id, LETTERS[i], ok, Date.now(), today(), remaining());
  if (round.mode === 'r08') st.r08 = q.no + 1;
  save();
  round.res.push({ id: q.id, ok });
  document.querySelectorAll('.ch').forEach((b, k) => {
    b.disabled = true;
    if (k === i) b.classList.add(ok ? 'ok' : 'ng');
    if (LETTERS[k] === q.answer) b.classList.add('correct');
  });
  if (navigator.vibrate) navigator.vibrate(ok ? 15 : [20, 40, 20]);
  const last = round.i + 1 === round.ids.length;
  const after = $('#after');
  after.innerHTML = `
    <div class="mark ${ok ? 'ok' : 'ng'}">${ok ? '〇 正解' : '× 不正解'}</div>
    ${cleared ? '<div class="cleared">今日のノルマ クリア</div>' : ''}
    <section class="exp">
      <h3>正解は ${q.answer}</h3>
      <div class="etext">${q.exp}</div>
      <p class="meta">${esc([FIELD_NAME[q.field], q.theme, q.topic].filter(Boolean).join(' ＞ '))}</p>
      <p class="meta">出典：${esc(q.source)}</p>
    </section>
    <button class="btn primary" data-act="next">${last ? '結果を見る' : '次の問題'}</button>`;
  const top = after.getBoundingClientRect().top;
  if (top > innerHeight * 0.5) {
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollBy({ top: top - innerHeight * 0.25, behavior: smooth ? 'smooth' : 'auto' });
  }
}

function nextQ() {
  round.i += 1;
  if (round.i < round.ids.length) showQ(); else result();
}

function result() {
  const n = round.res.filter(r => r.ok).length;
  $('#v').innerHTML = `
    <section class="card result">
      <h2>${round.res.length}問中 ${n}問 正解</h2>
      <ul class="rlist">${round.res.map(r => {
        const q = DB.byId[r.id];
        return `<li class="${r.ok ? 'ok' : 'ng'}"><b>${r.ok ? '〇' : '×'}</b><span>${esc(q.source)}</span><small>${esc(q.topic || q.theme || '')}</small></li>`;
      }).join('')}</ul>
    </section>
    <button class="btn primary big" data-act="again">もう10問</button>
    <button class="btn" data-act="home">ホームへ</button>`;
  window.scrollTo(0, 0);
}

function about() {
  $('#v').innerHTML = `
    <div class="qbar"><button class="x" data-act="home" aria-label="戻る">×</button><span>このアプリについて</span></div>
    <section class="card prose">
      <h2>問題の出典</h2>
      <p>過去問題は、IPA（独立行政法人 情報処理推進機構）が公開している ITパスポート試験の公開問題です。各問題に出典を出しています。IPA は、出典を書けば許諾や使用料なしで過去問題を問題集に使えるとしています。</p>
      <p>問題文は、冊子の画像を文字に起こしたものです。2つのAIで点検していますが、誤りが残っているかもしれません。おかしいと思ったら「原本を見る」で冊子を確かめてください。文字に起こす前の問題は、冊子の画像のまま出しています。</p>
      <h2>解説とAI作成問題</h2>
      <p>解説と「AI作成問題」は AI（Claude）が書いたもので、IPA の過去問題ではありません。誤りがあるかもしれません。</p>
      <h2>今日のノルマ</h2>
      <p>残り（まだ正解していない問題。前回間違えた問題を含みます。令和8年度は数えません）を、受験日の1週間前までに解き終える数です。受験日まで2週間を切ると、残りの日数の半分を復習用に残して計算します。1日10問より少なくはなりません。</p>
      <h2>記録</h2>
      <p>解いた記録は、このスマホのブラウザの中だけに保存します。どこにも送りません。機種変更やブラウザのデータ削除で消えます。iPhone では「ホーム画面に追加」してから使ってください。</p>
      <p class="sub">データの版 ${esc(DB.version)}</p>
    </section>`;
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------- 操作
var ACTIONS = {
  examSet: setExam,
  go: () => startRound(pickRound(st, DB.main, DB.extra, Math.random), 'おまかせ10問', 'go'),
  fields: () => { $('#fields').hidden = !$('#fields').hidden; },
  field: f => startRound(pickRound(st, DB.main.filter(inField(f)), DB.extra.filter(inField(f)), Math.random), FIELD_NAME[f], 'field', f),
  wrong: () => startRound(pickWrong(st, allIds()), '間違えた問題', 'wrong'),
  ai: () => startRound(pickRound(st, [], DB.extra, Math.random), 'AI作成問題', 'ai'),
  r08: () => (st.r08ok ? startR08() : r08Gate()),
  r08yes: () => { st.r08ok = true; save(); startR08(); },
  again: () => (round.mode === 'r08' ? startR08() : ACTIONS[round.mode](round.arg)),
  choose: i => answer(Number(i)),
  next: nextQ,
  home: home,
  about: about,
};

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (b && !b.disabled) ACTIONS[b.dataset.act](b.dataset.arg);
});

async function boot() {
  load();
  try {
    DB = index(await (await fetch('data/questions.json')).json());
  } catch (e) {
    $('#v').innerHTML = '<p class="msg">問題を読み込めませんでした。最初の1回は、電波のある所で開いてください。</p>';
    return;
  }
  home();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}

boot();
