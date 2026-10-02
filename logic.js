'use strict';
// 学習の計算（画面に触れない）。日付は端末の現地時間の 'YYYY-MM-DD'。

function ymd(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function daysBetween(a, b) {                        // b − a（日）
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

// 残りを受験日の1週間前までに解き終える1日の数。2週間を切ったら残り日数の半分を復習用に残す。最低10問。
function calcTarget(examDate, today, remaining) {
  if (!examDate) return null;
  const daysLeft = daysBetween(today, examDate);
  if (!(daysLeft > 0)) return null;
  const studyDays = Math.max(1, daysLeft - Math.min(7, Math.floor(daysLeft / 2)));
  return { target: Math.max(10, Math.ceil(remaining / studyDays)), daysLeft, studyDays };
}

function newState() {
  return { v: 1, examDate: null, ans: {}, day: null, r08: 1, r08ok: false };
}

function status(st, id) {
  const a = st.ans[id];
  return !a ? 'new' : a.ok ? 'ok' : 'wrong';
}

function remainingCount(st, ids) {
  return ids.filter(id => status(st, id) !== 'ok').length;
}

function shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function oldestFirst(st, ids) {
  return ids.slice().sort((x, y) => st.ans[x].at - st.ans[y].at);
}

// おまかせ: 間違えた（古い順に最大3）→ main の未回答 → extra の未回答 → 正解済み（古い順）→ 残りの間違えた
function pickRound(st, main, extra, rng, size = 10) {
  const all = main.concat(extra);
  const wrong = oldestFirst(st, all.filter(id => status(st, id) === 'wrong'));
  const order = [
    ...wrong.slice(0, 3),
    ...shuffled(main.filter(id => status(st, id) === 'new'), rng),
    ...shuffled(extra.filter(id => status(st, id) === 'new'), rng),
    ...oldestFirst(st, all.filter(id => status(st, id) === 'ok')),
    ...wrong.slice(3),
  ];
  return shuffled(order.slice(0, size), rng);
}

function pickWrong(st, ids, size = 10) {
  return oldestFirst(st, ids.filter(id => status(st, id) === 'wrong')).slice(0, size);
}

// 今日の記録。日付が変わったら、その日のノルマを決め直す。
function rollDay(st, today, remaining) {
  if (st.day && st.day.date === today) return st.day;
  const t = calcTarget(st.examDate, today, remaining);
  st.day = { date: today, target: t ? t.target : null, done: 0, cleared: false };
  return st.day;
}

// 受験日を変えたときだけ、今日のノルマも計算し直す。
function retarget(st, today, remaining) {
  const day = rollDay(st, today, remaining);
  const t = calcTarget(st.examDate, today, remaining);
  day.target = t ? t.target : null;
  day.cleared = day.target !== null && day.done >= day.target;
  return day;
}

// 解答を記録する。この1問でノルマに届いたら true。
function recordAnswer(st, id, choice, ok, now, today, remaining) {
  const prev = st.ans[id];
  st.ans[id] = { c: choice, ok, at: now, n: (prev ? prev.n : 0) + 1 };
  const day = rollDay(st, today, remaining);
  day.done += 1;
  if (day.target === null || day.cleared || day.done < day.target) return false;
  day.cleared = true;
  return true;
}

function fieldStats(st, questions) {
  const s = { S: { ok: 0, n: 0 }, M: { ok: 0, n: 0 }, T: { ok: 0, n: 0 }, all: { ok: 0, n: 0 } };
  for (const q of questions) {
    const a = st.ans[q.id];
    if (!a) continue;
    for (const k of [q.field, 'all']) {
      s[k].n += 1;
      if (a.ok) s[k].ok += 1;
    }
  }
  return s;
}
