const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let materialsCache = [];
let statusCache = { aiConfigured: false };
let sessionToken = null;

async function api(path, options = {}) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function showNotice(message, type = 'info', ms = 5000) {
  const el = $('#notice');
  el.textContent = message;
  el.className = `notice ${type}`;
  el.classList.remove('hidden');
  clearTimeout(showNotice._t);
  if (ms) showNotice._t = setTimeout(() => el.classList.add('hidden'), ms);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function modeBadge(mode) {
  const map = { A: 'モードA 穴埋め', B: 'モードB 用語説明', C: 'モードC 入試レベル', D: 'モードD 英単語' };
  return `<span class="badge ${mode}">${map[mode] || mode}</span>`;
}

function resultBadge(result) {
  const map = { correct: '〇 正解', partial: '△ 部分点', wrong: '× 不正解' };
  return `<span class="badge ${result}">${map[result] || result}</span>`;
}

function busy(btn, on) {
  if (!btn) return;
  if (on) {
    btn.dataset.label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
  } else {
    btn.disabled = false;
    if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
  }
}

/* ---------------- タブ ---------------- */

function switchTab(name) {
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  $$('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${name}`));
  if (name === 'home') loadHome();
  if (name === 'materials') loadMaterials();
  if (name === 'questions') loadQuestionFilters();
  if (name === 'study') loadStudySetup();
  if (name === 'review') loadReview();
}

$$('.tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));

/* ---------------- ステータス ---------------- */

async function loadStatus() {
  try {
    statusCache = await api('/api/status');
  } catch { /* ignore */ }
  if (!statusCache.aiConfigured) {
    showNotice('DEEPSEEK_API_KEY が未設定です。.env に設定してサーバーを再起動してください（詳細は README 参照）。', 'error', 0);
  }
}

/* ---------------- ホーム ---------------- */

async function loadHome() {
  const data = await api('/api/stats');
  $('#stats').innerHTML = `
    <div class="stat-box"><div class="num">${data.materials}</div><div class="label">資料</div></div>
    <div class="stat-box"><div class="num">${data.questions}</div><div class="label">問題</div></div>
    <div class="stat-box"><div class="num">${data.dueCount}</div><div class="label">復習待ち</div></div>
    <div class="stat-box"><div class="num">${data.historyCount}</div><div class="label">回答履歴</div></div>
  `;

  const mats = await loadMaterialsCache();
  const wrap = $('#quick-materials');
  wrap.innerHTML = mats.length
    ? mats.map((m) => `
        <div class="check-row">
          <label>
            <input type="checkbox" class="quick-mat" value="${m.id}" ${mats.length === 1 ? 'checked' : ''}>
            <span><b>${esc(m.title)}</b>${m.subject || m.unit ? ` — ${esc(m.subject)}${m.unit ? ' / ' + esc(m.unit) : ''}` : ''}（${m.questionCount}問）</span>
          </label>
        </div>`).join('')
    : '<div class="hint">資料がまだありません。「資料」タブから登録してください。</div>';
  restoreSetupSettings();
}

$('#quick-start').addEventListener('click', () => {
  const ids = [...$$('.quick-mat:checked')].map((c) => Number(c.value));
  if (!ids.length) return showNotice('資料を1つ以上選択してください。', 'error');
  startStudy(ids, Number($('#quick-count').value), $('#quick-start'), selectedMode('quick-mode'));
});/* ---------------- 資料 ---------------- */

async function loadMaterialsCache() {
  const data = await api('/api/materials');
  materialsCache = data.materials;
  return materialsCache;
}

function toggleInputType() {
  const type = $('input[name="inputType"]:checked').value;
  $('#file-input-wrap').classList.toggle('hidden', type !== 'file');
  $('#text-input-wrap').classList.toggle('hidden', type !== 'text');
}

$$('input[name="inputType"]').forEach((r) => r.addEventListener('change', toggleInputType));

$('#mat-register').addEventListener('click', async () => {
  const btn = $('#mat-register');
  const title = $('#mat-title').value.trim();
  const subject = $('#mat-subject').value.trim();
  const unit = $('#mat-unit').value.trim();
  if (!title) return showNotice('タイトルを入力してください。', 'error');

  const type = $('input[name="inputType"]:checked').value;
  try {
    busy(btn, true);
    if (type === 'file') {
      const file = $('#mat-file').files[0];
      if (!file) return showNotice('ファイルを選択してください。', 'error');
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', title);
      fd.append('subject', subject);
      fd.append('unit', unit);
      await api('/api/materials/upload', { method: 'POST', body: fd });
    } else {
      const content = $('#mat-content').value;
      if (!content.trim()) return showNotice('本文を入力してください。', 'error');
      await api('/api/materials/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, subject, unit, content }),
      });
    }
    showNotice('資料を登録しました。', 'success');
    $('#mat-title').value = '';
    $('#mat-content').value = '';
    $('#mat-file').value = '';
    await loadMaterials();
  } catch (e) {
    showNotice(e.message, 'error');
  } finally {
    busy(btn, false);
  }
});

async function loadMaterials() {
  try {
    const mats = await loadMaterialsCache();
    const list = $('#material-list');
    if (!mats.length) {
      list.innerHTML = '<div class="hint">資料がまだありません。</div>';
      return;
    }
    list.innerHTML = mats.map((m) => `
      <div class="material-item">
        <div>
          <div class="material-title">${esc(m.title)}</div>
          <div class="material-meta">${esc(m.subject) || '科目なし'} / ${esc(m.unit) || '単元なし'} ・ ${m.questionCount}問 ・ ${esc(m.created_at)}</div>
        </div>
        <div class="item-actions">
          <button class="btn small" data-view="${m.id}">問題一覧</button>
          <button class="btn small danger" data-del="${m.id}">削除</button>
        </div>
      </div>`).join('');

    list.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
      $('#q-material-filter').value = b.dataset.view;
      switchTab('questions');
      loadQuestions();
    }));
    list.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      const m = materialsCache.find((x) => x.id === Number(b.dataset.del));
      if (!confirm(`「${m.title}」と、その問題をすべて削除します。よろしいですか？`)) return;
      await api(`/api/materials/${m.id}`, { method: 'DELETE' });
      showNotice('削除しました。', 'success');
      loadMaterials();
    }));
  } catch (e) {
    showNotice(e.message, 'error');
  }
}

/* ---------------- モーダル（問題編集用） ---------------- */

function openModal(html) {
  $('#modal-body').innerHTML = html;
  $('#modal').classList.remove('hidden');
}

function closeModal() {
  $('#modal').classList.add('hidden');
}

/* ---------------- 問題一覧・管理 ---------------- */

async function loadQuestionFilters() {
  await loadMaterialsCache();
  const sel = $('#q-material-filter');
  const current = sel.value;
  sel.innerHTML = '<option value="">すべて</option>' +
    materialsCache.map((m) => `<option value="${m.id}">${esc(m.title)}</option>`).join('');
  if (materialsCache.some((m) => String(m.id) === current)) sel.value = current;
  await loadQuestions();
}

$('#q-material-filter').addEventListener('change', loadQuestions);
$('#q-mode-filter').addEventListener('change', loadQuestions);
$('#q-reload').addEventListener('click', loadQuestions);

async function loadQuestions() {
  const materialId = $('#q-material-filter').value;
  const mode = $('#q-mode-filter').value;
  const params = new URLSearchParams();
  if (materialId) params.set('materialId', materialId);
  if (mode) params.set('mode', mode);
  const data = await api(`/api/questions?${params.toString()}`);
  const list = $('#question-list');
  if (!data.questions.length) {
    list.innerHTML = '<div class="hint">該当する問題がありません。資料タブから問題を生成してください。</div>';
    return;
  }
  list.innerHTML = data.questions.map((q) => `
    <div class="question-item">
      <div>
        <div>${modeBadge(q.mode)} <b>${esc(q.mode === 'A' ? q.text : q.theme)}</b></div>
        <div class="material-meta">
          ${q.mode === 'A' ? `正解: ${esc(q.blank_word)}` : `テーマ: ${esc(q.theme)}`}
          ・ 資料: ${esc(q.material_title)}
        </div>
      </div>
      <div class="item-actions">
        <button class="btn small" data-edit="${q.id}">編集</button>
        <button class="btn small danger" data-del="${q.id}">削除</button>
      </div>
    </div>`).join('');

  list.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openEditModal(Number(b.dataset.edit))));
  list.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('この問題を削除しますか？')) return;
    await api(`/api/questions/${b.dataset.del}`, { method: 'DELETE' });
    showNotice('削除しました。', 'success');
    loadQuestions();
  }));
}

async function openEditModal(id) {
  const params = new URLSearchParams();
  if ($('#q-material-filter').value) params.set('materialId', $('#q-material-filter').value);
  const data = await api(`/api/questions?${params.toString()}`);
  const q = data.questions.find((x) => x.id === id);
  if (!q) return;

  const isA = q.mode === 'A';
  openModal(`
    <h2>問題を編集</h2>
    <label>問題文（空欄は（　））<textarea id="edit-text" rows="4">${esc(q.text)}</textarea></label>
    ${isA ? `
      <label>正解の語句<input type="text" id="edit-blank" value="${esc(q.blank_word)}"></label>
      <label>許容する別表記（カンマ区切り）<input type="text" id="edit-acceptable" value="${esc((q.acceptable || []).join(','))}"></label>
    ` : `
      <label>テーマ<input type="text" id="edit-theme" value="${esc(q.theme)}"></label>
      <label>模範解答<textarea id="edit-model" rows="5">${esc(q.model_answer)}</textarea></label>
      <label>キーポイント（改行区切り）<textarea id="edit-points" rows="3">${esc((q.points || []).join('\n'))}</textarea></label>
    `}
    <label>解説<textarea id="edit-explain" rows="3">${esc(q.explanation)}</textarea></label>
    <div class="modal-actions">
      <button class="btn" id="edit-cancel">キャンセル</button>
      <button class="btn primary" id="edit-save">保存</button>
    </div>`);

  $('#edit-cancel').addEventListener('click', closeModal);
  $('#edit-save').addEventListener('click', async () => {
    const body = { text: $('#edit-text').value, explanation: $('#edit-explain').value };
    if (isA) {
      body.blank_word = $('#edit-blank').value;
      body.acceptable = $('#edit-acceptable').value.split(/[,、]/).map((s) => s.trim()).filter(Boolean);
    } else {
      body.theme = $('#edit-theme').value;
      body.model_answer = $('#edit-model').value;
      body.points = $('#edit-points').value.split('\n').map((s) => s.trim()).filter(Boolean);
    }
    await api(`/api/questions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    showNotice('保存しました。', 'success');
    closeModal();
    loadQuestions();
  });
}

/* ---------------- 出題 ---------------- */

function saveSetupSettings() {
  const read = (matSel, countId, modeName, dirName) => ({
    materials: [...$$(matSel)].filter((c) => c.checked).map((c) => Number(c.value)),
    count: Number($(countId).value),
    mode: selectedMode(modeName),
    direction: selectedDirection(dirName),
  });
  try {
    localStorage.setItem('aichi_setup', JSON.stringify({
      study: read('.study-mat', '#study-count', 'study-mode', 'study-direction'),
      quick: read('.quick-mat', '#quick-count', 'quick-mode', 'quick-direction'),
    }));
  } catch (e) {
    // 保存できなくても動作は継続
  }
}

function restoreSetupSettings() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem('aichi_setup') || 'null');
  } catch (e) {
    saved = null;
  }
  if (!saved) return;
  const apply = (matSel, ids) => {
    if (!Array.isArray(ids)) return;
    $$(matSel).forEach((c) => { c.checked = ids.includes(Number(c.value)); });
  };
  const applyMode = (name, mode) => {
    if (!mode) return;
    const r = document.querySelector(`input[name="${name}"][value="${mode}"]`);
    if (r) r.checked = true;
  };
  const applyDirection = (name, direction) => {
    if (!direction) return;
    const r = document.querySelector(`input[name="${name}"][value="${direction}"]`);
    if (r) r.checked = true;
  };
  if (saved.study) {
    apply('.study-mat', saved.study.materials);
    if (saved.study.count) $('#study-count').value = String(saved.study.count);
    applyMode('study-mode', saved.study.mode);
    applyDirection('study-direction', saved.study.direction);
    syncDirectionVisibility('study');
  }
  if (saved.quick) {
    apply('.quick-mat', saved.quick.materials);
    if (saved.quick.count) $('#quick-count').value = String(saved.quick.count);
    applyMode('quick-mode', saved.quick.mode);
    applyDirection('quick-direction', saved.quick.direction);
    syncDirectionVisibility('quick');
  }
}

async function loadStudySetup() {
  await loadMaterialsCache();
  const wrap = $('#study-materials');
  wrap.innerHTML = materialsCache.length
    ? materialsCache.map((m) => `
        <div class="check-row">
          <label>
            <input type="checkbox" class="study-mat" value="${m.id}" ${materialsCache.length === 1 ? 'checked' : ''}>
            <span><b>${esc(m.title)}</b>（${m.questionCount}問）</span>
          </label>
        </div>`).join('')
    : '<div class="hint">資料がまだありません。「資料」タブから登録してください。</div>';
  restoreSetupSettings();
}

$('#study-start').addEventListener('click', () => {
  const ids = [...$$('.study-mat:checked')].map((c) => Number(c.value));
  if (!ids.length) return showNotice('資料を1つ以上選択してください。', 'error');
  startStudy(ids, Number($('#study-count').value), $('#study-start'), selectedMode('study-mode'));
});

function selectedMode(name) {
  const el = document.querySelector(`input[name="${name}"]:checked`);
  return el ? el.value : 'mix';
}

function selectedDirection(name) {
  const el = document.querySelector(`input[name="${name}"]:checked`);
  return el ? el.value : 'both';
}

function syncDirectionVisibility(prefix) {
  const mode = selectedMode(prefix + '-mode');
  const wrap = $('#' + prefix + '-direction-wrap');
  if (wrap) wrap.classList.toggle('hidden', mode !== 'D');
}

$$('input[name="quick-mode"], input[name="study-mode"]').forEach((r) =>
  r.addEventListener('change', () => syncDirectionVisibility(r.name.replace('-mode', '')))
);

async function startStudy(materialIds, count, btn, mode = 'mix') {
  if (!statusCache.aiConfigured) {
    return showNotice('AI（APIキー）が未設定のため採点できません。.env を確認してください。', 'error');
  }
  saveSetupSettings();
  busy(btn, true);
  try {
    const direction = mode === 'D' ? selectedDirection(btn.id === 'quick-start' ? 'quick-direction' : 'study-direction') : 'ja_to_en';
    const data = await api('/api/session/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ materialIds, count, mode, direction }),
    });
    sessionToken = data.token;
    if (data.reused > 0) {
      showNotice(`作成済みの問題 ${data.reused} 問を再利用しました（不足分だけ新規作成）`, 'info', 6000);
    }
    $('#study-setup').classList.add('hidden');
    $('#study-session').classList.remove('hidden');
    $('#q-result').classList.add('hidden');
    await fetchNextQuestion();
    switchTab('study');
  } catch (e) {
    showNotice(e.message, 'error', 8000);
  } finally {
    busy(btn, false);
  }
}

function renderQuestion(q, index, total) {
  clearNextTimer();
  $('#q-question-card').classList.remove('is-correct', 'is-partial', 'is-wrong');
  const banner = $('#q-result-banner');
  banner.classList.add('hidden');
  banner.textContent = '';
  $('#session-progress').textContent = `第 ${index} / ${total} 問`;
  $('#q-badge').innerHTML = modeBadge(q.mode);
  $('#q-text').innerHTML = (q.mode === 'A'
    ? esc(q.text).replace(/（　）/g, '<span style="border-bottom:2px solid var(--primary); padding:0 12px;">　　　</span>')
    : q.mode === 'C' || q.mode === 'D'
      ? esc(q.text)
      : `「${esc(q.theme)}」について、自分の言葉で説明してください。`)
    + (q.mode === 'B' && Array.isArray(q.points) && q.points.length
      ? `<div class="q-points"><b>説明の観点（これを含めると高評価）:</b><ul>${q.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`
      : '')
    + (q.mode === 'D' && q.explanation
      ? `<div class="q-points"><b>例文:</b> ${esc(q.explanation)}</div>`
      : '');
  const area = $('#q-answer-area');
  const hintWrap = $('#q-hint-wrap');
  if (q.mode === 'A') {
    area.innerHTML = `<div class="q-answer-label">空欄に入る語句を入力してください<span class="kbd">Enter で回答・採点</span></div>
      <input type="text" id="q-input" autocomplete="off" placeholder="答えを入力">`;
    $('#q-input').focus();
    if (q.blank_word) {
      const chars = q.blank_word.replace(/\s/g, '');
      const first = [...chars][0] ?? '';
      const typeHint = /[\u4e00-\u9faf]/.test(chars) ? '漢字' : /[\u30a0-\u30ff]/.test(chars) ? 'カタカナ' : 'ひらがな';
      hintWrap.classList.remove('hidden');
      hintWrap.innerHTML = `<button class="btn small hint-toggle" type="button">💡 ヒントを見る</button>
        <div class="q-hint-body hidden">
          文字数: <b>${chars.length}文字</b><br>
          頭文字: <b>「${esc(first)}」</b><br>
          表記: <b>${typeHint}</b>
        </div>`;
      hintWrap.querySelector('.hint-toggle').addEventListener('click', (e) => {
        const body = e.currentTarget.nextElementSibling;
        body.classList.toggle('hidden');
        e.currentTarget.textContent = body.classList.contains('hidden') ? '💡 ヒントを見る' : '💡 ヒントを隠す';
      });
    } else {
      hintWrap.classList.add('hidden');
      hintWrap.innerHTML = '';
    }
  } else if (q.mode === 'C') {
    hintWrap.classList.add('hidden');
    hintWrap.innerHTML = '';
    const letters = ['ア', 'イ', 'ウ', 'エ', 'オ'];
    const opts = (q.options || []).map((o, i) =>
      `<label class="choice-item"><input type="radio" name="q-choice" value="${esc(o)}"> <span class="choice-letter">${letters[i] || i + 1}.</span> <span class="choice-text">${esc(o)}</span></label>`
    ).join('');
    area.innerHTML = `<div class="q-answer-label">正しい答えを1つ選んでください<span class="kbd">Enter で回答・採点</span></div>
      <div class="choice-list">${opts || '<p style="color:var(--muted)">選択肢がありません。</p>'}</div>`;
    const firstRadio = area.querySelector('input[type="radio"]');
    if (firstRadio) firstRadio.focus();
  } else if (q.mode === 'D') {
    hintWrap.classList.add('hidden');
    hintWrap.innerHTML = '';
    area.innerHTML = `<div class="q-answer-label">答えを入力してください<span class="kbd">Enter で回答・採点</span></div>
      <input type="text" id="q-input" autocomplete="off" placeholder="答えを入力" autofocus inputmode="${q.direction === 'en_to_ja' ? 'text' : 'text'}">`;
    $('#q-input').focus();
  } else {
    hintWrap.classList.add('hidden');
    hintWrap.innerHTML = '';
    area.innerHTML = `<div class="q-answer-label">説明を入力してください<span class="kbd">Ctrl+Enter で回答・採点</span></div>
      <textarea id="q-input" placeholder="例: 〜という出来事で、〜した。それにより〜になった。"></textarea>`;
    $('#q-input').focus();
  }
  $('#q-submit').classList.remove('hidden');
  $('#q-result').classList.add('hidden');
  $('#q-submit').disabled = false;
  $('#q-submit').innerHTML = '回答して採点';
  $('#q-waiting').classList.add('hidden');
  window._currentQuestion = q;
}

async function fetchNextQuestion() {
  const data = await api(`/api/session/${sessionToken}/next`);
  if (data.done) {
    return endSession(data.stats);
  }
  renderQuestion(data.question, data.index, data.total);
}

$('#q-submit').addEventListener('click', async () => {
  const q = window._currentQuestion;
  let answer;
  if (q?.mode === 'C') {
    const sel = document.querySelector('input[name="q-choice"]:checked');
    if (!sel) {
      showNotice('選択肢を1つ選んでください', 'error');
      return;
    }
    answer = sel.value;
  } else {
    answer = $('#q-input').value;
  }
  const btn = $('#q-submit');
  busy(btn, true);
  $('#q-waiting').classList.remove('hidden');
  try {
    const data = await api(`/api/session/${sessionToken}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId: q.id, answer }),
    });
    renderResult(data, answer);
  } catch (e) {
    showNotice(e.message, 'error', 8000);
    busy(btn, false);
  } finally {
    $('#q-waiting').classList.add('hidden');
  }
});

function renderResult(data, answer) {
  const g = data.grading;
  const q = window._currentQuestion;
  $('#q-submit').classList.add('hidden');
  const card = $('#q-question-card');
  card.classList.remove('is-correct', 'is-partial', 'is-wrong');
  card.classList.add('is-' + g.result);
  const banner = $('#q-result-banner');
  const bannerText = { correct: '〇 正解!', partial: '△ 部分点', wrong: '× 不正解' }[g.result] || g.result;
  banner.textContent = bannerText;
  banner.className = 'result-banner result-banner-' + g.result;
  banner.classList.remove('hidden');
  banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  const box = $('#q-result');
  box.classList.remove('hidden');
  const good = (g.good_points || []).filter(Boolean);
  const missing = (g.missing_points || []).filter(Boolean);
  const goodHtml = good.length
    ? `<div class="result-feedback good"><b>正しかった点:</b><br>${good.map((p) => `・${esc(p)}`).join('<br>')}</div>`
    : (g.feedback ? `<div class="result-feedback">${esc(g.feedback)}</div>` : '');
  const missingHtml = missing.length
    ? `<div class="result-feedback bad"><b>不足・間違っていた点:</b><br>${missing.map((p) => `・${esc(p)}`).join('<br>')}</div>`
    : '';
  const correctLine = q?.mode === 'A'
    ? `<div class="result-answer"><span class="lbl">答え:</span> ${esc(q.text).replace(/（　）/g, `<span class="correct-answer">${esc(data.correctAnswer)}</span>`)}</div>`
    : q?.mode === 'C'
      ? `<div class="result-answer"><span class="lbl">正解:</span> <span class="correct-answer">${esc(data.correctAnswer)}</span></div>`
      : `<div class="result-answer"><span class="lbl">正解:</span> ${esc(data.correctAnswer)}</div>`;
  box.innerHTML = `
    <h2>採点結果</h2>
    <div class="result-answer"><span class="lbl">あなたの解答:</span> ${esc(answer)}</div>
    ${goodHtml}
    ${missingHtml}
    ${correctLine}
    ${data.explanation ? `<div class="result-answer"><span class="lbl">解説:</span> ${esc(data.explanation)}</div>` : ''}
    <div class="modal-actions">
      <button class="btn primary" id="q-next">次の問題へ<span class="kbd">Enter / スペース</span></button>
    </div>
    <div class="tap-next-hint">画面のどこをタップしても次へ進みます</div>`;
  if (q?.mode === 'C') {
    const ci = Number(q.correct_index);
    const items = document.querySelectorAll('.choice-item');
    items.forEach((el, i) => {
      const input = el.querySelector('input');
      input.disabled = true;
      if (i === ci) el.classList.add('is-correct-choice');
      else if (input.checked) el.classList.add('is-wrong-choice');
    });
  }
  const nextBtn = $('#q-next');
  const advance = () => {
    clearNextTimer();
    nextBtn.disabled = true;
    if (data.next) {
      renderQuestion(data.next, data.index + 1, data.total);
    } else {
      endSession(data.stats);
    }
  };
  nextBtn.addEventListener('click', advance);
  nextBtn.addEventListener('mouseenter', () => {
    clearNextTimer();
    nextBtn.textContent = '次の問題へ';
  });
  nextBtn.focus();
  box.addEventListener('click', (e) => {
    if (nextBtn.disabled) return;
    if (e.target.closest('#q-next')) return;
    advance();
  });
  if ($('#q-autonext').checked) startNextTimer(nextBtn, advance);
}

let nextTimer = null;
const AUTO_NEXT_SECONDS = 3;
function startNextTimer(btn, advance) {
  clearNextTimer();
  let n = AUTO_NEXT_SECONDS;
  btn.textContent = `次の問題へ（${n}）`;
  nextTimer = setInterval(() => {
    n -= 1;
    if (n <= 0) {
      clearNextTimer();
      advance();
      return;
    }
    btn.textContent = `次の問題へ（${n}）`;
  }, 1000);
}
function clearNextTimer() {
  if (nextTimer) {
    clearInterval(nextTimer);
    nextTimer = null;
  }
}

document.addEventListener('keydown', (e) => {
  const inSession = !$('#study-session').classList.contains('hidden');
  if (!inSession) return;
  const tag = e.target.tagName;
  const typing = tag === 'INPUT' || tag === 'TEXTAREA';
  if (typing && e.key === 'Enter') {
    const mode = window._currentQuestion?.mode;
    if (mode === 'A' && e.target.id === 'q-input') {
      e.preventDefault();
      $('#q-submit').click();
      return;
    }
    if (mode === 'B' && e.target.id === 'q-input' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      $('#q-submit').click();
      return;
    }
    if (mode === 'C' && e.target.type === 'radio') {
      e.preventDefault();
      $('#q-submit').click();
      return;
    }
  }
  if (!typing && ['Enter', ' ', 'ArrowRight', 'n', 'N'].includes(e.key)) {
    const btn = $('#q-next') || $('#q-back-setup');
    if (btn && !btn.disabled && !$('#q-result').classList.contains('hidden')) {
      e.preventDefault();
      btn.click();
    }
  }
});

function endSession(stats) {
  clearNextTimer();
  $('#q-result').classList.remove('hidden');
  $('#q-result').innerHTML = `
    <h2>出題終了</h2>
    <div class="stats" style="margin-top:8px">
      <div class="stat-box"><div class="num">${stats.answered}</div><div class="label">解答数</div></div>
      <div class="stat-box"><div class="num" style="color:var(--ok)">${stats.correct}</div><div class="label">正解</div></div>
      <div class="stat-box"><div class="num" style="color:var(--partial)">${stats.partial}</div><div class="label">部分点</div></div>
      <div class="stat-box"><div class="num" style="color:var(--bad)">${stats.wrong}</div><div class="label">不正解</div></div>
    </div>
    <div class="modal-actions">
      <button class="btn primary" id="q-back-setup">出題セットへ戻る</button>
    </div>
    <div class="tap-next-hint">画面のどこをタップしても出題セットへ戻ります</div>`;
  $('#q-back-setup').addEventListener('click', () => {
    sessionToken = null;
    $('#study-session').classList.add('hidden');
    $('#study-setup').classList.remove('hidden');
    loadStudySetup();
  });
  $('#q-result').addEventListener('click', (e) => {
    if (e.target.closest('#q-back-setup')) return;
    $('#q-back-setup').click();
  });
  $('#q-back-setup').focus();
}

$('#session-quit').addEventListener('click', () => {
  sessionToken = null;
  $('#study-session').classList.add('hidden');
  $('#study-setup').classList.remove('hidden');
});

/* ---------------- 復習・履歴 ---------------- */

async function loadReview() {
  try {
    const [r, h] = await Promise.all([api('/api/review'), api('/api/history')]);

    const rt = $('#review-table');
    if (!r.review.length) {
      rt.innerHTML = '<tr><td>まだ復習データがありません。出題して回答するとここに表示されます。</td></tr>';
    } else {
      rt.innerHTML = `<tr><th>問題</th><th>資料</th><th>次回出題</th><th>間隔</th><th>連続正解</th><th>累計 正/誤</th><th>直前結果</th></tr>` +
        r.review.map((x) => `<tr>
          <td>${modeBadge(x.mode)} ${esc(x.mode === 'A' ? x.text : x.theme)}</td>
          <td>${esc(x.material_title)}</td>
          <td>${esc(x.next_review_at)}</td>
          <td>${x.interval_days}日</td>
          <td>${x.consecutive_correct}回</td>
          <td>${x.total_correct} / ${x.total_wrong}</td>
          <td>${resultBadge(x.last_result)}</td>
        </tr>`).join('');
    }

    const ht = $('#history-table');
    if (!h.history.length) {
      ht.innerHTML = '<tr><td>まだ履歴がありません。</td></tr>';
    } else {
      ht.innerHTML = `<tr><th>日時</th><th>問題</th><th>結果</th><th>解答</th><th>フィードバック</th></tr>` +
        h.history.map((x) => `<tr>
          <td style="white-space:nowrap">${esc(x.answered_at)}</td>
          <td>${modeBadge(x.mode)} ${esc(x.mode === 'A' ? x.question_text : x.theme)}</td>
          <td>${resultBadge(x.result)}</td>
          <td style="max-width:260px">${esc(x.answer)}</td>
          <td style="max-width:320px">${esc(x.feedback)}</td>
        </tr>`).join('');
    }
  } catch (e) {
    showNotice(e.message, 'error');
  }
}

/* ---------------- 初期化 ---------------- */

async function init() {
  await loadStatus();
  await loadHome();
}

init();
