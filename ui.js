/* ============================================
   我家菜谱 - 通用 UI 工具（图标 / 格式化 / 弹窗）
   ============================================ */

// ============================================
// 工具函数
// ============================================
const $ = id => document.getElementById(String(id).replace(/^#/, ''));

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/** 属性值转义：esc() 不会转义引号，放进 data-* 里会把属性截断 */
function escAttr(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  return `${formatDate(isoStr)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function friendlyDate(isoStr) {
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr || '';
  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  // 今年的日期省略年份，跨年时补上，避免"9月22日"分不清哪一年
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const datePart = sameYear
    ? `${d.getMonth() + 1}月${d.getDate()}日`
    : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  return `${datePart} · ${days[d.getDay()]}`;
}

/** 读屏播报用的常驻区域：toast 是临时元素，靠它才能被念出来 */
function announceToScreenReader(msg) {
  let live = document.getElementById('sr-live');
  if (!live) {
    live = document.createElement('div');
    live.id = 'sr-live';
    live.className = 'sr-only';
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    document.body.appendChild(live);
  }
  live.textContent = msg;
}

const TOAST_TONE_CLASS = {
  info: '',
  success: 'toast-success',
  error: 'toast-error',
  progress: 'toast-progress'
};

/** 淡出后移除；不支持动画时兜底直接移除 */
function dismissToast(el) {
  if (!el || !el.isConnected) return;
  el.classList.add('toast-out');
  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    el.remove();
  };
  el.addEventListener('animationend', remove, { once: true });
  setTimeout(remove, 320);
}

/**
 * 轻提示。tone 用来区分四种情况：
 *   success  操作成功（带对勾）
 *   error    操作失败（红底，停留更久）
 *   progress 正在进行（转圈，不会自动消失，通常会被随后的结果提示替换）
 *   info     纯告知（默认）
 * 文案越长停留越久，最长 6 秒。
 */
function showToast(msg, { tone = 'info', actionText = '', onAction = null, duration } = {}) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = ['toast', TOAST_TONE_CLASS[tone], actionText ? 'toast-action' : ''].filter(Boolean).join(' ');
  el.innerHTML = `<span class="toast-text">${esc(msg)}</span>` +
    (actionText ? `<button type="button" class="toast-btn">${esc(actionText)}</button>` : '');
  document.body.appendChild(el);
  announceToScreenReader(msg);

  let timer = null;
  if (tone === 'progress') {
    // 正常会被随后的结果提示或弹窗收掉；这里放个兜底，避免流程异常时一直挂着
    timer = setTimeout(() => dismissToast(el), 12000);
  } else {
    const base = tone === 'error' ? 4200 : 2200;
    const ms = duration != null ? duration : Math.min(base + Math.max(0, msg.length - 12) * 90, 6000);
    timer = setTimeout(() => dismissToast(el), ms);
  }

  const btn = el.querySelector('.toast-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      if (timer) clearTimeout(timer);
      dismissToast(el);
      if (onAction) onAction();
    });
  }
  return {
    close: () => {
      if (timer) clearTimeout(timer);
      dismissToast(el);
    }
  };
}

/** 带操作按钮的 toast（例如「已移入回收站 · 撤销」） */
function showActionToast(msg, { actionText = '撤销', onAction = null, duration = 5200, tone = 'success' } = {}) {
  return showToast(msg, { tone, actionText, onAction, duration });
}

/**
 * 统一的提示弹窗：用于"必须被看见"的结果或说明。
 * rows 是 [标签, 数值] 数组；message / hint 允许传入已经安全的 HTML。
 */
function showInfoSheet({
  title,
  rows = [],
  message = '',
  hint = '',
  confirmText = '知道了',
  onConfirm = null,
  secondaryText = '',
  onSecondary = null,
  danger = false,
  dangerText = false
}) {
  // 弹窗出现时收掉"进行中"提示，避免两条信息同时挂在屏幕上
  dismissToast(document.querySelector('.toast-progress'));
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active center';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-title" style="margin-bottom:10px">${esc(title)}</div>
      ${rows.length ? `<div class="card" style="margin-bottom:12px">
        ${rows.map(([label, value]) => `<div class="ing-row"><span>${esc(label)}</span><span class="ing-amount">${esc(value)}</span></div>`).join('')}
      </div>` : ''}
      ${message ? `<div class="sheet-message${dangerText ? ' danger' : ''}">${message}</div>` : ''}
      ${hint ? `<div class="form-hint" style="margin-top:10px">${hint}</div>` : ''}
      <div style="display:flex;gap:10px;margin-top:20px">
        ${secondaryText ? `<button class="btn btn-secondary" style="flex:1" data-action="info-secondary">${esc(secondaryText)}</button>` : ''}
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" style="flex:1" data-action="info-confirm">${esc(confirmText)}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('[data-action=info-confirm]').addEventListener('click', () => {
    overlay.remove();
    if (onConfirm) onConfirm();
  });
  const secondary = overlay.querySelector('[data-action=info-secondary]');
  if (secondary) {
    secondary.addEventListener('click', () => {
      overlay.remove();
      if (onSecondary) onSecondary();
    });
  }
}

/** 失败提示弹窗：说明原因 + 可选「重试」 */
function showErrorSheet({ title = '操作没成功', message = '', hint = '', retryText = '', onRetry = null }) {
  showInfoSheet({
    title,
    message,
    hint,
    dangerText: true,
    confirmText: retryText || '知道了',
    onConfirm: retryText ? onRetry : null,
    secondaryText: retryText ? '关闭' : ''
  });
}

/** 表单行内错误：在输入框下方显示红字提示，把光标移过去，改动后自动清除 */
function showFieldError(input, message) {
  if (!input) return;
  clearFieldError(input);
  input.classList.add('input-error');
  const tip = document.createElement('div');
  tip.className = 'field-error';
  tip.textContent = message;
  input.insertAdjacentElement('afterend', tip);
  try {
    input.focus();
  } catch (e) {
    // 个别浏览器聚焦失败不影响提示
  }
  const clear = () => clearFieldError(input);
  input.addEventListener('input', clear, { once: true });
  input.addEventListener('change', clear, { once: true });
}

function clearFieldError(input) {
  if (!input) return;
  input.classList.remove('input-error');
  const next = input.nextElementSibling;
  if (next && next.classList.contains('field-error')) next.remove();
}

/** 管理页（分类 / 厨具 / 动作）的错误处理：被菜谱占用时用弹窗说明，其余就近提示 */
function handleManagerError(err, inlineInput) {
  const msg = (err && err.message) ? err.message : '操作没有成功';
  if (msg.includes('正在被')) {
    showInfoSheet({
      title: '这个还有菜谱在用',
      message: msg,
      hint: '先在那些菜谱里把它换掉或去掉，然后再回来删除。',
      confirmText: '知道了'
    });
    return;
  }
  if (inlineInput) showFieldError(inlineInput, msg);
  else showToast(msg, { tone: 'error' });
}

// ============================================
// 自定义下拉：外观跟输入框一致，点开是应用内的选择弹窗
// （不用浏览器原生的 select 样式）
// ============================================

/** options: [{ value, label }] */
function selectButtonHtml({ id = '', className = '', title = '', placeholder = '请选择', options = [], value = '', disabled = false, style = '' }) {
  const hit = options.find(o => String(o.value) === String(value));
  return `<button type="button"${id ? ` id="${escAttr(id)}"` : ''} class="select-btn${hit ? '' : ' placeholder'}${className ? ` ${className}` : ''}"${disabled ? ' disabled' : ''}
    data-action="open-option-picker"
    aria-haspopup="listbox"
    aria-expanded="false"
    data-title="${escAttr(title)}"
    data-placeholder="${escAttr(placeholder)}"
    data-options="${escAttr(JSON.stringify(options))}"
    value="${escAttr(String(value == null ? '' : value))}"${style ? ` style="${style}"` : ''}>
    <span class="select-btn-value">${esc(hit ? hit.label : placeholder)}</span>
    <span class="select-btn-arrow">${SVG.chevDown}</span>
  </button>`;
}

/** 更新一个自定义下拉的选项与当前值（不触发 change 事件） */
function updateSelectButton(el, { options, value, placeholder, disabled }) {
  if (!el) return;
  if (options) el.dataset.options = JSON.stringify(options);
  if (placeholder != null) {
    el.dataset.placeholder = placeholder;
    const label = el.querySelector('.select-btn-value');
    if (label && !value) label.textContent = placeholder;
  }
  if (disabled != null) el.disabled = disabled;
  if (value != null) {
    const list = JSON.parse(el.dataset.options || '[]');
    const hit = list.find(o => String(o.value) === String(value));
    el.value = value;
    const label = el.querySelector('.select-btn-value');
    if (label) label.textContent = hit ? hit.label : (el.dataset.placeholder || '');
    el.classList.toggle('placeholder', !hit);
  }
}

/** 选定之后：写回值、更新显示、并派发 change 让表单逻辑（标记已修改、重算参数）生效 */
function setSelectButtonValue(el, value) {
  updateSelectButton(el, { value });
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

const OPTION_SEARCH_MIN = 8; // 选项超过这个数量就带搜索框

function openOptionPicker(trigger) {
  const options = JSON.parse(trigger.dataset.options || '[]');
  if (!options.length) return;
  const current = trigger.value;
  const searchable = options.length >= OPTION_SEARCH_MIN;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-sheet-body">
        <div class="modal-handle"></div>
        <div class="modal-title">${esc(trigger.dataset.title || '请选择')}</div>
        ${searchable ? `<input class="input" id="option-search" placeholder="输入关键字查找" style="margin-bottom:10px">` : ''}
        <div class="option-list" id="option-list" role="listbox" aria-label="${escAttr(trigger.dataset.title || '请选择')}">
          ${options.map(o => `
            <button type="button" role="option" aria-selected="${String(o.value) === String(current)}" class="option-item${String(o.value) === String(current) ? ' on' : ''}" data-value="${escAttr(String(o.value))}">
              <span>${esc(o.label)}</span>${String(o.value) === String(current) ? SVG.check : ''}
            </button>`).join('')}
        </div>
        <div class="form-hint" id="option-empty" style="display:none">没有匹配的选项</div>
      </div>
      <div class="modal-sheet-footer">
        <button class="btn btn-secondary btn-block" id="option-cancel">取消</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  trigger.setAttribute('aria-expanded', 'true');
  const closePicker = () => {
    trigger.setAttribute('aria-expanded', 'false');
    overlay.remove();
  };
  overlay.querySelector('#option-cancel').addEventListener('click', closePicker);

  overlay.querySelectorAll('.option-item').forEach(btn => {
    btn.addEventListener('click', () => {
      trigger.setAttribute('aria-expanded', 'false');
      setSelectButtonValue(trigger, btn.dataset.value);
      overlay.remove();
    });
  });

  const search = overlay.querySelector('#option-search');
  if (search) {
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      let shown = 0;
      overlay.querySelectorAll('.option-item').forEach(btn => {
        const hit = !q || btn.textContent.trim().toLowerCase().includes(q);
        btn.style.display = hit ? '' : 'none';
        if (hit) shown += 1;
      });
      const empty = overlay.querySelector('#option-empty');
      if (empty) empty.style.display = shown ? 'none' : '';
    });
  }
}

// ============================================
// 自定义日期选择：今天 / 昨天 / 前天 + 月历
// ============================================
const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

function toIsoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateOffsetIso(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toIsoDate(d);
}

/** 把 2026-09-22 显示成「今天 · 9月22日」「昨天 · 9月21日」「2025年12月3日 周三」 */
function formatDateCn(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.round((todayStart - d) / 86400000);
  const md = `${d.getMonth() + 1}月${d.getDate()}日`;
  if (diff === 0) return `今天 · ${md}`;
  if (diff === 1) return `昨天 · ${md}`;
  if (diff === 2) return `前天 · ${md}`;
  const y = d.getFullYear() === today.getFullYear() ? '' : `${d.getFullYear()}年`;
  return `${y}${md} 周${WEEK_LABELS[d.getDay()]}`;
}

function dateButtonHtml({ id = '', value = '', title = '选择日期', className = '' }) {
  return `<button type="button"${id ? ` id="${escAttr(id)}"` : ''} class="select-btn date-btn${className ? ` ${className}` : ''}"
    data-action="open-date-picker" data-title="${escAttr(title)}" value="${escAttr(value)}">
    <span class="select-btn-value">${esc(formatDateCn(value))}</span>
    <span class="select-btn-arrow">${SVG.chevDown}</span>
  </button>`;
}

function setDateButtonValue(trigger, iso) {
  trigger.value = iso;
  const label = trigger.querySelector('.select-btn-value');
  if (label) label.textContent = formatDateCn(iso);
  trigger.dispatchEvent(new Event('change', { bubbles: true }));
}

function openDatePicker(trigger) {
  const todayIso = toIsoDate(new Date());
  const selected = /^\d{4}-\d{2}-\d{2}$/.test(trigger.value) ? trigger.value : todayIso;
  let view = new Date(`${selected}T00:00:00`);
  view = new Date(view.getFullYear(), view.getMonth(), 1);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-sheet-body">
        <div class="modal-handle"></div>
        <div class="modal-title">${esc(trigger.dataset.title || '选择日期')}</div>
        <div class="chips-wrap" style="margin-bottom:14px">
          ${[['今天', 0], ['昨天', 1], ['前天', 2]].map(([label, back]) =>
            `<button type="button" class="chip date-quick${selected === dateOffsetIso(back) ? ' on' : ''}" data-back="${back}">${label}</button>`).join('')}
        </div>
        <div class="date-picker-head">
          <button type="button" class="icon-btn" data-nav="-1" aria-label="上个月">${SVG.chevL}</button>
          <span class="date-picker-label" id="date-picker-label"></span>
          <button type="button" class="icon-btn" data-nav="1" aria-label="下个月">${SVG.chevR}</button>
        </div>
        <div class="date-picker-week">${WEEK_LABELS.map(w => `<span>${w}</span>`).join('')}</div>
        <div class="date-picker-grid" id="date-picker-grid"></div>
      </div>
      <div class="modal-sheet-footer">
        <button class="btn btn-secondary btn-block" id="date-cancel">取消</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  const paint = () => {
    overlay.querySelector('#date-picker-label').textContent = `${view.getFullYear()} 年 ${view.getMonth() + 1} 月`;
    const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    const lead = new Date(view.getFullYear(), view.getMonth(), 1).getDay();
    const cells = [];
    for (let i = 0; i < lead; i += 1) cells.push('<span class="date-cell empty"></span>');
    for (let d = 1; d <= days; d += 1) {
      const iso = toIsoDate(new Date(view.getFullYear(), view.getMonth(), d));
      const cls = ['date-cell'];
      if (iso === selected) cls.push('on');
      if (iso === todayIso) cls.push('today');
      cells.push(`<button type="button" class="${cls.join(' ')}" data-day="${iso}">${d}</button>`);
    }
    overlay.querySelector('#date-picker-grid').innerHTML = cells.join('');
    overlay.querySelectorAll('.date-cell[data-day]').forEach(btn => {
      btn.addEventListener('click', () => {
        setDateButtonValue(trigger, btn.dataset.day);
        close();
      });
    });
  };
  paint();

  overlay.querySelectorAll('.date-quick').forEach(btn => {
    btn.addEventListener('click', () => {
      setDateButtonValue(trigger, dateOffsetIso(Number(btn.dataset.back)));
      close();
    });
  });
  overlay.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      view = new Date(view.getFullYear(), view.getMonth() + Number(btn.dataset.nav), 1);
      paint();
    });
  });
  overlay.querySelector('#date-cancel').addEventListener('click', close);
}

// 内联 SVG 图标
const SVG = {
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  chevR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>',
  sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>',
  zap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  type: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>',
  inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>',
  clipboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 13h6M9 17h4"/></svg>',
  package: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 9.4L7.55 4.24"/><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
  tool: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>'
  ,
  chevUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 15l-6-6-6 6"/></svg>',
  chevDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  chevL: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
  ,
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="20" x2="20" y2="20"/><rect x="6" y="11" width="3" height="9" rx="1"/><rect x="11" y="6" width="3" height="14" rx="1"/><rect x="16" y="14" width="3" height="6" rx="1"/></svg>'
};

// 分类首字色块：颜色统一在 styles.css 的 :root 里定义，这里只做「分类 → 令牌名」的映射
const CAT_TONES = {
  '肉类': '--tone-meat', '水产': '--tone-fish', '素菜': '--tone-veg', '主食': '--tone-staple',
  '汤': '--tone-soup', '热菜': '--tone-hot', '凉菜': '--tone-cold', '甜品': '--tone-dessert',
  // 兼容旧分类名
  '家常菜': '--tone-home', '汤类': '--tone-soup'
};

function catTone(cat) {
  return `var(${CAT_TONES[cat] || '--tone-default'})`;
}

function firstChar(name) {
  return (name || '菜').trim().charAt(0);
}

function recipeFirstCat(recipe) {
  return (recipe.categoryIds && recipe.categoryIds[0]) || recipe.category || '';
}

function tileHtml(recipe, cls) {
  const img = recipe.images && recipe.images[0];
  const src = img ? imageSrc(img, 'thumb') : '';
  if (src) {
    return `<span class="recipe-tile ${cls} has-img" style="background-image:url('${src}')"></span>`;
  }
  return `<span class="recipe-tile ${cls}" style="background:${catTone(recipeFirstCat(recipe))}">${esc(firstChar(recipe.name))}</span>`;
}

function gridCardHtml(recipe) {
  const img = recipe.images && recipe.images[0];
  const src = img ? imageSrc(img, 'thumb') : '';
  const cover = src
    ? `<span class="grid-cover" style="background-image:url('${src}')"></span>`
    : `<span class="grid-cover" style="background:${catTone(recipeFirstCat(recipe))}">${esc(firstChar(recipe.name))}</span>`;
  return `
    <button class="grid-card" data-action="open-recipe" data-id="${recipe.id}">
      ${cover}
      <span class="grid-name">${esc(recipe.name)}</span>
      <span class="grid-cat">${esc(recipeFirstCat(recipe) || '未分类')}</span>
    </button>`;
}

function starsHtml(rating, large) {
  const value = Number(rating) || 0;
  let html = `<span class="stars${large ? ' large' : ''}">`;
  for (let i = 1; i <= 5; i++) {
    const cls = value >= i ? 'full' : (value >= i - 0.5 ? 'half' : 'empty');
    html += `<span class="star ${cls}">★</span>`;
  }
  return html + '</span>';
}

function ratingLabelText(value) {
  return value ? `${value} 分` : '未评分';
}

function sectionTitle(title) {
  return `<div class="section-title"><span class="bar"></span>${esc(title)}</div>`;
}

function confirmSheet({ title, message, confirmText = '确定', cancelText = '取消', onConfirm, danger = false }) {
  // 和 showInfoSheet 是同一套弹窗，这里只保留"确认/取消"的调用习惯
  showInfoSheet({
    title,
    message,
    confirmText,
    secondaryText: cancelText,
    danger,
    onConfirm
  });
}
