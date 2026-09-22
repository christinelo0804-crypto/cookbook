/* ============================================
   我家菜谱 - 主应用逻辑
   ============================================ */

// ============================================
// 全局状态
// ============================================
const App = {
  currentTab: 'home',
  currentPage: null,
  editingRecipe: null,
  viewingRecipe: null,
  recipeView: 'card',
  searchQuery: '',
  recipes: [],
  categories: [],
  cookwares: [],
  actions: [],
  editImages: [],
  editDirty: false,
  sheetRating: 0,
  sheetResults: [],
  editingRecord: null,
  recordsFilterRecipeId: null,
  sortMode: 'updated',
  cookbookQuery: '',
  filters: {
    categories: [],
    servings: [],
    photos: 'any',
    cookwares: [],
    rating: null,
    cooked: null
  },
  collapsedMonths: [],
  fromPage: 'home'
};


// ============================================
// 页面导航
// ============================================
const PAGE_MAP = {
  home: 'page-home',
  cookbook: 'page-cookbook',
  records: 'page-records',
  profile: 'page-profile'
};

function switchTab(tab) {
  App.currentTab = tab;
  document.querySelector('.bottom-tabs').style.display = 'flex';
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));

  const page = $(PAGE_MAP[tab]);
  if (page) page.classList.add('active');
  const tabEl = document.querySelector(`.tab-item[data-tab="${tab}"]`);
  if (tabEl) tabEl.classList.add('active');

  if (tab === 'home') renderHome();
  else if (tab === 'cookbook') renderCookbook();
  else if (tab === 'records') renderRecords();
  else if (tab === 'profile') renderProfile();

  App.currentPage = PAGE_MAP[tab];
  App.searchQuery = '';
  App.fromPage = tab;
}

function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = $(pageId);
  if (page) page.classList.add('active');
  App.currentPage = pageId;
  const hideTabs = ['page-detail', 'page-edit', 'page-trash', 'page-stats'];
  document.querySelector('.bottom-tabs').style.display = hideTabs.includes(pageId) ? 'none' : 'flex';
}

function goBack() {
  if (App.currentPage === 'page-edit' && App.editDirty) {
    openUnsavedSheet();
    return;
  }
  App.editDirty = false;
  // 有历史记录时用浏览器返回（这样手机返回手势也能逐级回退），否则回到来源 Tab
  if (window.history.state && window.history.state.view) {
    window.history.back();
    return;
  }
  switchTab(App.fromPage || 'home');
}

// ============================================
// 历史记录（支持系统返回手势逐级返回）
// ============================================
App.suppressPush = false;

function pushViewState(state) {
  if (App.suppressPush) return;
  const current = window.history.state;
  // 同一个页面重复渲染（如保存记录后刷新详情）不新增历史，否则返回键要按两次才退出去
  const sameView = current && current.view === state.view &&
    (current.id == null ? state.id == null : current.id === state.id);
  try {
    if (sameView) window.history.replaceState(state, '');
    else window.history.pushState(state, '');
  } catch (e) {
    // 某些环境（如 file://）可能限制 pushState，忽略即可
  }
}

function renderFromHistory(state) {
  App.suppressPush = true;
  try {
    if (!state || !state.view) {
      switchTab(App.fromPage || 'home');
    } else if (state.view === 'detail') {
      showRecipeDetail(state.id);
    } else if (state.view === 'edit') {
      if (state.id) showEditRecipe(state.id); else showNewRecipe();
    } else if (state.view === 'stats') {
      showStats();
    } else if (state.view === 'trash') {
      showTrash();
    } else if (state.view === 'versions') {
      showVersions(state.id);
    } else if (state.view === 'version') {
      showVersionDetail(state.id);
    }
  } finally {
    App.suppressPush = false;
  }
}

window.addEventListener('popstate', event => {
  renderFromHistory(event.state);
});

function markDirty() {
  if (App.currentPage === 'page-edit') App.editDirty = true;
}

function openUnsavedSheet() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active center';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-title" style="margin-bottom:10px">有修改还没保存</div>
      <div style="font-size: 0.9375rem;line-height:1.6;color:var(--color-text-secondary)">离开前要先保存吗？</div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:20px">
        <button class="btn btn-primary" data-action="unsaved-save">保存修改</button>
        <button class="btn btn-secondary" data-action="unsaved-discard">不保存，直接离开</button>
        <button class="btn btn-ghost" data-action="unsaved-cancel">继续编辑</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

// ============================================
// 初始化
// ============================================
async function init() {
  await initDB();

  // 老数据迁移：把 base64 图片转成二进制存储（一次性，幂等）
  try {
    const converted = await migrateLegacyImages();
    if (converted > 0) showToast(`已优化 ${converted} 道菜谱的图片存储`);
  } catch (e) {
    // 迁移失败不阻塞使用，下次启动会重试
  }

  // 旧版默认分类 → 新版默认分类（只做一次，用户自定义过则跳过）
  if (!localStorage.getItem('my-recipes-cat-v2')) {
    try {
      const changed = await migrateLegacyDefaultCategories();
      localStorage.setItem('my-recipes-cat-v2', '1');
      if (changed >= 0) showToast('已更新默认分类');
    } catch (e) {
      // 失败则下次启动重试
    }
  }

  App.categories = await getCategories();
  App.cookwares = await getCookwares();
  App.actions = await getActions();

  // 字号设置
  const savedSize = localStorage.getItem('my-recipes-font-size') || '标准';
  applyFontSize(savedSize);

  renderHome();

  document.querySelectorAll('.tab-item').forEach(el => {
    el.addEventListener('click', () => switchTab(el.dataset.tab));
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(reg => {
        // Service Worker 更新完成后自动刷新一次，确保立刻看到最新版本
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'activated' && navigator.serviceWorker.controller && !sessionStorage.getItem('mrs-sw-updated')) {
              sessionStorage.setItem('mrs-sw-updated', '1');
              location.reload();
            }
          });
        });
      })
      .catch(() => {});
  }

  // 编辑页输入即标记为"有未保存修改"
  const editPage = $('page-edit');
  editPage.addEventListener('input', markDirty);
  editPage.addEventListener('change', markDirty);

  window.addEventListener('beforeunload', e => {
    if (App.currentPage === 'page-edit' && App.editDirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // 首次使用引导
  if (!localStorage.getItem('my-recipes-welcomed') && (await DB.recipes.count()) === 0) {
    showWelcomeSheet();
  }
}

function showWelcomeSheet() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-sheet-body">
        <div class="modal-handle"></div>
        <div class="modal-title">欢迎使用我家菜谱</div>
        <div class="modal-sub">三步就能开始</div>
        <div class="card">
          <div class="ing-row"><span>1. 新建菜谱</span><span class="ing-amount">记下菜名、食材、步骤</span></div>
          <div class="ing-row"><span>2. 做菜时打开照做</span><span class="ing-amount">火候、时长一眼看到</span></div>
          <div class="ing-row"><span>3. 做完点「今天做过」</span><span class="ing-amount">写下评分和改进，菜谱越用越好</span></div>
        </div>
        <div class="form-hint" style="margin-top:12px">数据保存在这台设备上，记得定期在「我的 → 导出备份」保存一份。</div>
      </div>
      <div class="modal-sheet-footer">
        <button class="btn btn-secondary" style="flex:1" data-action="welcome-sample">添加示例菜谱</button>
        <button class="btn btn-primary" style="flex:1" data-action="welcome-dismiss">自己开始</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

async function addSampleRecipe() {
  await createRecipe({
    name: '番茄炒蛋',
    description: '最家常的一道菜，酸甜下饭。',
    categoryIds: ['热菜'],
    serving: '2人份',
    ingredients: [
      { name: '番茄', amount: '2个' },
      { name: '鸡蛋', amount: '3个' },
      { name: '盐', amount: '适量' },
      { name: '糖', amount: '1小勺' }
    ],
    cookwares: [{ name: '炒锅' }, { name: '燃气灶' }],
    steps: [
      { action: '切', heat: '', temperature: '', duration: '', note: '番茄切块，鸡蛋打散' },
      { action: '炒', heat: '中火', temperature: '', duration: '3分钟', note: '先炒蛋盛出，再炒番茄' },
      { action: '调味', heat: '小火', temperature: '', duration: '1分钟', note: '加盐和糖，倒入鸡蛋拌匀' }
    ]
  });
}

function applyFontSize(level) {
  const map = { '标准': 16, '大': 18, '特大': 20 };
  document.documentElement.style.fontSize = `${map[level] || 16}px`;
  localStorage.setItem('my-recipes-font-size', level);
}

// ============================================
// 首页
// ============================================
async function renderHome() {
  const container = $('home-content');

  container.innerHTML = `
    <div class="search-bar">
      <span class="search-bar-icon">${SVG.search}</span>
      <input type="text" placeholder="搜索菜谱、食材、厨具…" value="${esc(App.searchQuery)}" id="home-search-input">
    </div>
    <div id="home-body"></div>
  `;

  const input = $('#home-search-input');
  input.addEventListener('input', () => {
    App.searchQuery = input.value;
    renderHomeBody();
  });

  await renderHomeBody();
}

async function renderHomeBody() {
  const body = $('#home-body');
  if (!body) return;
  const stats = await getHomeStats();
  App.recipes = await getAllRecipes();

  let html = '';
  if (App.searchQuery) {
    const results = await searchRecipes(App.searchQuery);
    html += sectionTitle(`搜索结果 · ${results.length} 道`);
    if (results.length === 0) {
      html += `<div class="empty-state"><div class="empty-state-icon">${SVG.search}</div><div class="empty-state-text">没有找到匹配的菜谱</div></div>`;
    } else {
      html += results.map(r => recipeCardHtml(r)).join('');
    }
  } else {
    const recentRecords = await getAllCookRecords();
    const recentRecipeIds = [...new Set(recentRecords.map(r => r.recipeId))];
    const recentRecipes = App.recipes.filter(r => recentRecipeIds.includes(r.id)).slice(0, 3);
    const freq = stats.frequent.slice(0, 3);

    html += `
      <button class="stats-card stats-card-button" data-action="open-stats" aria-label="查看菜谱统计">
        <span class="stat"><span class="stat-value">${stats.recipeCount}</span><span class="stat-label">我的菜谱</span></span>
        <span class="stat"><span class="stat-value">${stats.monthCount}</span><span class="stat-label">本月做过</span></span>
        <span class="stat"><span class="stat-value">${stats.topRating || 0}</span><span class="stat-label">最高评分</span></span>
      </button>
    `;

    if (recentRecipes.length > 0) {
      html += sectionTitle('最近做过');
      html += `<div class="freq-grid">` + recentRecipes.map(r => {
        const rec = recentRecords.find(rc => rc.recipeId === r.id);
        return `
          <button class="freq-card" data-action="open-recipe" data-id="${r.id}">
            ${tileHtml(r, 'md')}
            <span class="freq-card-name">${esc(r.name)}</span>
            <span class="freq-card-sub">${rec ? friendlyDate(rec.date) : ''}</span>
          </button>`;
      }).join('') + `</div>`;
    }

    if (freq.length > 0) {
      html += sectionTitle('常做菜');
      html += `<div class="freq-grid">` + freq.map(r => `
        <button class="freq-card" data-action="open-recipe" data-id="${r.id}">
          ${tileHtml(r, 'md')}
          <span class="freq-card-name">${esc(r.name)}</span>
          <span class="freq-card-sub">做过 ${r.totalCookCount} 次</span>
        </button>`).join('') + `</div>`;
    }

    if (App.recipes.length === 0) {
      html += `
        <div class="empty-state">
          <div class="empty-state-icon">${SVG.book}</div>
          <div class="empty-state-text">还没有菜谱<br>记录你的第一道菜吧</div>
          <button class="btn btn-primary" data-action="new-recipe">${SVG.plus} 新建菜谱</button>
        </div>`;
    } else {
      html += `
        <div class="action-bar home-bar">
          <button class="btn btn-primary" data-action="new-recipe">${SVG.plus} 新建菜谱</button>
        </div>`;
    }
  }
  body.innerHTML = html;
}

/** 备份状态：显示在「我的 → 导出备份」这一行 */
function backupStatus() {
  const reminderOn = localStorage.getItem('my-recipes-backup-remind') !== 'off';
  const lastAt = localStorage.getItem('my-recipes-last-export-at');
  if (!lastAt) {
    return reminderOn ? { text: '还没备份过', warn: true } : { text: '', warn: false };
  }
  const days = Math.floor((Date.now() - new Date(lastAt).getTime()) / 86400000);
  if (reminderOn && days >= 30) return { text: `${days} 天未备份`, warn: true };
  return { text: `上次 ${formatDate(lastAt)}`, warn: false };
}

function recipeCardHtml(recipe, row) {
  const cat = recipeFirstCat(recipe);
  return `
    <button class="recipe-card${row ? ' row' : ''}" data-action="open-recipe" data-id="${recipe.id}">
      ${tileHtml(recipe, row ? 'sm' : 'lg')}
      <span class="recipe-card-info">
        <span class="recipe-card-title">${esc(recipe.name)}</span>
        <span class="recipe-card-meta">${cat ? esc(cat) + ' · ' : ''}做过 ${recipe.totalCookCount || 0} 次</span>
        ${row ? '' : `<span class="recipe-card-stars">${starsHtml(recipe.averageRating)}</span>`}
      </span>
    </button>`;
}

// ============================================
// 菜谱页
// ============================================
async function renderCookbook() {
  App.recipes = await getAllRecipes();
  App.categories = await getCategories();

  const container = $('cookbook-content');
  let html = `
    <div class="flex-between" style="margin-bottom:12px">
      <div style="display:flex;align-items:baseline;gap:8px">
        <span class="page-title">菜谱</span>
        <span class="page-count">${App.recipes.length} 道</span>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <div class="view-toggle">
          <button class="${App.recipeView === 'card' ? 'on' : ''}" data-action="view-card" aria-label="缩略图模式">${SVG.grid}</button>
          <button class="${App.recipeView === 'list' ? 'on' : ''}" data-action="view-list" aria-label="列表模式">${SVG.list}</button>
        </div>
      </div>
    </div>
  `;

  const activeCount = activeFilterCount(App.filters);
  const summary = filterSummaryLabels(App.filters);
  html += `
    <div class="search-row">
      <div class="search-bar">
        <span class="search-bar-icon">${SVG.search}</span>
        <input type="text" placeholder="在菜谱里搜索…" value="${esc(App.cookbookQuery)}" id="cookbook-search-input">
      </div>
      <button class="filter-btn${activeCount ? ' active' : ''}" data-action="open-filter-sheet" aria-label="筛选">
        ${SVG.sliders}<span>筛选</span>${activeCount ? `<span class="filter-badge">${activeCount}</span>` : ''}
      </button>
    </div>
  `;

  if (summary.length) {
    html += `
    <div class="filter-row">
      <div class="filter-summary">
        ${summary.map(label => `<span class="filter-tag">${esc(label)}</span>`).join('')}
        <span class="filter-count" id="cookbook-count"></span>
      </div>
      <button class="clear-link" data-action="clear-filters">清除</button>
    </div>
    `;
  }

  const sorts = [['updated', '最近更新'], ['cooks', '做得最多'], ['rating', '评分最高']];
  html += `<div class="chips-row" style="padding-bottom:10px">`;
  sorts.forEach(([key, label]) => {
    html += `<button class="chip small${App.sortMode === key ? ' on' : ''}" data-action="sort-recipes" data-sort="${key}">${label}</button>`;
  });
  html += `</div>`;

  html += `<div id="cookbook-list"></div>`;
  container.innerHTML = html;

  const input = $('#cookbook-search-input');
  input.addEventListener('input', () => {
    App.cookbookQuery = input.value;
    renderCookbookList();
  });

  await renderCookbookList();
}

async function renderCookbookList() {
  const list = $('#cookbook-list');
  if (!list) return;
  const base = await getCookbookBase();
  const filtered = sortRecipes(applyFilters(base, App.filters), App.sortMode);

  const countEl = $('#cookbook-count');
  if (countEl) countEl.textContent = `共 ${filtered.length} 道`;

  if (filtered.length === 0) {
    const hasQuery = (App.cookbookQuery || '').trim().length > 0;
    const hasFilter = activeFilterCount(App.filters) > 0;
    list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${SVG.inbox}</div><div class="empty-state-text">${hasQuery || hasFilter ? '没有符合条件的菜谱<br>试试放宽条件' : '这里还没有菜谱'}</div>${hasFilter ? '<button class="btn btn-secondary" data-action="clear-filters">清除筛选</button>' : ''}</div>`;
  } else if (App.recipeView === 'card') {
    list.innerHTML = `<div class="recipe-grid">${filtered.map(gridCardHtml).join('')}</div>`;
  } else {
    list.innerHTML = filtered.map(r => recipeCardHtml(r, true)).join('');
  }
}

/** 当前搜索关键词命中的菜谱（筛选在此基础上叠加） */
async function getCookbookBase() {
  const query = (App.cookbookQuery || '').trim();
  const all = App.recipes.length ? App.recipes : await getAllRecipes();
  return query ? await searchRecipes(query) : all.slice();
}

function sortRecipes(list, mode) {
  const copy = list.slice();
  if (mode === 'cooks') copy.sort((a, b) => (b.totalCookCount || 0) - (a.totalCookCount || 0));
  else if (mode === 'rating') copy.sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0));
  else copy.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  return copy;
}

// ============================================
// 筛选
// ============================================
const RATING_OPTIONS = [
  ['4.5', '4.5星以上'],
  ['4', '4星以上'],
  ['3.5', '3.5星以上'],
  ['3', '3星以上'],
  ['none', '未评分']
];

const COOKED_OPTIONS = [
  ['1', '做过'],
  ['5', '5次以上'],
  ['10', '10次以上'],
  ['0', '没做过']
];

const SERVING_FALLBACK = ['1人份', '2人份', '4人份', '6人份', '8人份'];

function newFilters() {
  return {
    categories: [], servings: [], photos: 'any', cookwares: [],
    rating: null, cooked: null
  };
}

function cloneFilters(f) {
  return {
    categories: f.categories.slice(),
    servings: f.servings.slice(),
    photos: f.photos,
    cookwares: f.cookwares.slice(),
    rating: f.rating,
    cooked: f.cooked
  };
}

function activeFilterCount(f) {
  return f.categories.length + f.servings.length + f.cookwares.length +
    (f.photos !== 'any' ? 1 : 0) + (f.rating ? 1 : 0) + (f.cooked ? 1 : 0);
}

function matchCategory(recipe, name) {
  const cats = recipe.categoryIds || [];
  return name === '未分类' ? cats.length === 0 : cats.includes(name);
}

function matchRating(recipe, value) {
  const rating = recipe.averageRating || 0;
  if (value === 'none') return rating === 0;
  return rating >= Number(value);
}

function matchCooked(recipe, value) {
  const count = recipe.totalCookCount || 0;
  if (value === '0') return count === 0;
  return count >= Number(value);
}

/** 单个菜谱是否满足筛选条件；skipKey 用于计算某个维度的可选数量 */
function matchFilters(recipe, f, skipKey) {
  if (skipKey !== 'categories' && f.categories.length) {
    if (!f.categories.some(name => matchCategory(recipe, name))) return false;
  }
  if (skipKey !== 'servings' && f.servings.length) {
    if (!f.servings.includes(recipe.serving)) return false;
  }
  if (skipKey !== 'photos' && f.photos !== 'any') {
    const hasPhoto = (recipe.images || []).length > 0;
    if (f.photos === 'yes' && !hasPhoto) return false;
    if (f.photos === 'no' && hasPhoto) return false;
  }
  if (skipKey !== 'cookwares' && f.cookwares.length) {
    const names = (recipe.cookwares || []).map(c => c.name || c);
    if (!f.cookwares.some(n => names.includes(n))) return false;
  }
  if (skipKey !== 'rating' && f.rating) {
    if (!matchRating(recipe, f.rating)) return false;
  }
  if (skipKey !== 'cooked' && f.cooked) {
    if (!matchCooked(recipe, f.cooked)) return false;
  }
  return true;
}

function applyFilters(recipes, f) {
  return recipes.filter(r => matchFilters(r, f));
}

function filterSummaryLabels(f) {
  const parts = [];
  f.categories.forEach(c => parts.push(c));
  f.servings.forEach(s => parts.push(s));
  if (f.photos === 'yes') parts.push('有照片');
  if (f.photos === 'no') parts.push('没照片');
  f.cookwares.forEach(c => parts.push(c));
  if (f.rating) parts.push((RATING_OPTIONS.find(o => o[0] === f.rating) || [, f.rating])[1]);
  if (f.cooked) parts.push((COOKED_OPTIONS.find(o => o[0] === f.cooked) || [, f.cooked])[1]);
  return parts;
}

/** 弹窗里每个选项后面的可选数量 */
function facetCount(base, key, matcher) {
  return base.filter(matcher).length;
}

function filterChip(action, group, value, label, on, count, showCount) {
  const disabled = !on && count === 0;
  if (disabled) return '';
  return `<button type="button" class="chip${on ? ' on' : ''}" data-action="${action}" data-group="${group}" data-value="${esc(value)}">${esc(label)}${showCount ? ` <span class="chip-count">${count}</span>` : ''}</button>`;
}

async function showFilterSheet() {
  const base = await getCookbookBase();
  let draft = cloneFilters(App.filters);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  // 抽屉外壳只创建一次，选项更新时只替换里面的内容，避免每次点击都重播弹出动画
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-sheet-body">
        <div class="modal-handle"></div>
        <div class="modal-title">筛选</div>
        <div id="filter-groups"></div>
      </div>
      <div class="modal-sheet-footer">
        <button class="btn btn-secondary" style="flex:1" data-action="filter-reset">重置</button>
        <button class="btn btn-primary" style="flex:2" data-action="filter-apply" id="filter-apply">查看全部</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const groupsEl = overlay.querySelector('#filter-groups');
  const applyBtn = overlay.querySelector('#filter-apply');

  const render = () => {
    const baseFor = key => base.filter(r => matchFilters(r, draft, key));
    const countAll = base.filter(r => matchFilters(r, draft)).length;

    const catBase = baseFor('categories');
    const catNames = [...App.categories.map(c => c.name), '未分类'];
    const catChips = catNames
      .map(name => filterChip('filter-toggle', 'categories', name, name, draft.categories.includes(name), facetCount(catBase, 'categories', r => matchCategory(r, name)), true))
      .join('');

    const servingBase = baseFor('servings');
    const servings = [...new Set([...SERVING_FALLBACK, ...App.recipes.map(r => r.serving).filter(Boolean)])];
    const servingChips = servings
      .map(s => filterChip('filter-toggle', 'servings', s, s, draft.servings.includes(s), facetCount(servingBase, 'servings', r => r.serving === s), true))
      .join('');

    const photoBase = baseFor('photos');
    const photoChips = [
      filterChip('filter-photos', 'photos', 'any', '不限', draft.photos === 'any', 0, false),
      filterChip('filter-photos', 'photos', 'yes', '有照片', draft.photos === 'yes', facetCount(photoBase, 'photos', r => (r.images || []).length > 0), true),
      filterChip('filter-photos', 'photos', 'no', '没照片', draft.photos === 'no', facetCount(photoBase, 'photos', r => !(r.images || []).length), true)
    ].join('');

    const cwBase = baseFor('cookwares');
    const cwChips = App.cookwares
      .map(c => filterChip('filter-toggle', 'cookwares', c.name, c.name, draft.cookwares.includes(c.name), facetCount(cwBase, 'cookwares', r => (r.cookwares || []).map(x => x.name || x).includes(c.name)), true))
      .join('');

    const ratingBase = baseFor('rating');
    const ratingChips = filterChip('filter-rating', 'rating', '', '不限', !draft.rating, 0, false) +
      RATING_OPTIONS.map(([value, label]) => filterChip('filter-rating', 'rating', value, label, draft.rating === value, facetCount(ratingBase, 'rating', r => matchRating(r, value)), true)).join('');

    const cookedBase = baseFor('cooked');
    const cookedChips = filterChip('filter-cooked', 'cooked', '', '不限', !draft.cooked, 0, false) +
      COOKED_OPTIONS.map(([value, label]) => filterChip('filter-cooked', 'cooked', value, label, draft.cooked === value, facetCount(cookedBase, 'cooked', r => matchCooked(r, value)), true)).join('');

    groupsEl.innerHTML = `
      <div class="filter-group"><div class="filter-label">分类<span class="filter-hint">可多选</span></div><div class="chips-wrap">${catChips || '<span class="text-tertiary" style="font-size: 0.875rem">暂无分类</span>'}</div></div>
      <div class="filter-group"><div class="filter-label">份量<span class="filter-hint">可多选</span></div><div class="chips-wrap">${servingChips}</div></div>
      <div class="filter-group"><div class="filter-label">照片<span class="filter-hint">仅单选</span></div><div class="chips-wrap">${photoChips}</div></div>
      <div class="filter-group"><div class="filter-label">厨具<span class="filter-hint">可多选</span></div><div class="chips-wrap">${cwChips || '<span class="text-tertiary" style="font-size: 0.875rem">还没有厨具</span>'}</div></div>
      <div class="filter-group"><div class="filter-label">评分<span class="filter-hint">仅单选</span></div><div class="chips-wrap">${ratingChips}</div></div>
      <div class="filter-group"><div class="filter-label">做过的次数<span class="filter-hint">仅单选</span></div><div class="chips-wrap">${cookedChips}</div></div>
    `;
    applyBtn.textContent = `查看 ${countAll} 道菜`;
  };

  overlay.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) {
      if (e.target === overlay) overlay.remove();
      return;
    }
    const action = el.dataset.action;
    const group = el.dataset.group;
    const value = el.dataset.value;
    if (action === 'filter-toggle') {
      const list = draft[group];
      const idx = list.indexOf(value);
      if (idx >= 0) list.splice(idx, 1); else list.push(value);
      render();
    } else if (action === 'filter-photos') {
      draft.photos = value;
      render();
    } else if (action === 'filter-rating') {
      draft.rating = value || null;
      render();
    } else if (action === 'filter-cooked') {
      draft.cooked = value || null;
      render();
    } else if (action === 'filter-reset') {
      draft = newFilters();
      render();
    } else if (action === 'filter-apply') {
      App.filters = draft;
      overlay.remove();
      renderCookbook();
    } else if (action === 'close-sheet') {
      overlay.remove();
    }
  });

  render();
}

// ============================================
// 菜谱详情
// ============================================
async function showRecipeDetail(id) {
  pushViewState({ view: 'detail', id });
  const recipe = await getRecipe(id);
  if (!recipe) { showToast('菜谱不存在'); return; }
  App.viewingRecipe = recipe;
  App.fromPage = App.currentPage === 'page-cookbook' ? 'cookbook'
    : App.currentPage === 'page-records' ? 'records'
    : App.currentPage === 'page-home' ? 'home' : App.fromPage;

  showPage('page-detail');

  const versions = await getVersions(id);
  const records = await getCookRecords(id);
  const currentVersion = versions[versions.length - 1];
  const cat = recipeFirstCat(recipe);

  let html = `
    <div class="detail-page">
      <div class="detail-topbar">
        <div class="detail-topbar-left">
          <button class="icon-btn" data-action="back" aria-label="返回">${SVG.back}</button>
        </div>
        <div class="detail-topbar-right">
          <button class="icon-btn" data-action="recipe-menu" data-id="${recipe.id}" aria-label="更多操作">${SVG.more}</button>
        </div>
      </div>

      <div class="detail-hero">
        ${(recipe.images && recipe.images.length)
          ? `<button class="hero-cover-btn" data-action="open-photo" data-id="${recipe.id}" data-index="0" aria-label="查看菜谱照片">${tileHtml(recipe, 'xl')}</button>`
          : tileHtml(recipe, 'xl')}
        <div class="detail-hero-info">
          <h1 class="detail-hero-name">${esc(recipe.name)}</h1>
          <div class="detail-hero-tags">
            ${cat ? `<span class="tag">${esc(cat)}</span>` : ''}
            ${recipe.serving ? `<span class="tag">${esc(recipe.serving)}</span>` : ''}
            <span class="tag">做过 ${recipe.totalCookCount || 0} 次</span>
          </div>
          <div class="detail-hero-stars">
            ${starsHtml(recipe.averageRating, false)}
            <span class="hero-rating">${recipe.averageRating || 0}</span>
          </div>
        </div>
      </div>
  `;

  if (recipe.description) {
    html += `<div class="detail-desc">${esc(recipe.description)}</div>`;
  }

  if (recipe.images && recipe.images.length > 1) {
    html += `<div class="photo-strip">`;
    recipe.images.slice(1).forEach((img, i) => {
      html += `<button class="photo-strip-btn" data-action="open-photo" data-id="${recipe.id}" data-index="${i + 1}" aria-label="查看第 ${i + 2} 张照片"><img src="${imageSrc(img)}" alt="${esc(recipe.name)}"></button>`;
    });
    html += `</div>`;
  }

  if (recipe.ingredients && recipe.ingredients.length) {
    html += sectionTitle('食材');
    html += `<div class="card">`;
    recipe.ingredients.forEach(g => {
      html += `<div class="ing-row"><span>${esc(g.name)}</span><span class="ing-amount">${esc(g.amount || '')}</span></div>`;
    });
    html += `</div>`;
  }

  if (recipe.cookwares && recipe.cookwares.length) {
    html += sectionTitle('厨具');
    html += `<div class="card"><div class="tag-line">`;
    recipe.cookwares.forEach(c => {
      html += `<span class="tag">${SVG.check} ${esc(c.name || c)}</span>`;
    });
    html += `</div></div>`;
  }

  if (recipe.steps && recipe.steps.length) {
    html += sectionTitle('步骤');
    html += `<div class="card">`;
    recipe.steps.forEach((s, i) => {
      const params = [];
      if (s.heat) params.push(esc(s.heat));
      if (s.duration) params.push(esc(s.duration));
      if (s.temperature) params.push(esc(s.temperature));
      html += `
        <div class="step-item">
          <span class="step-number">${i + 1}</span>
          <div class="step-detail">
            <div class="step-action">${esc(s.action || '')}</div>
            ${params.length ? `<div class="step-params">${params.map(p => `<span>${p}</span>`).join('')}</div>` : ''}
            ${s.note ? `<div class="step-note">${esc(s.note)}</div>` : ''}
          </div>
        </div>`;
    });
    html += `</div>`;
  }

  if (records.length) {
    html += sectionTitle(`做菜记录 · ${records.length}`);
    html += `<div class="card">`;
    records.slice(0, 5).forEach(r => {
      html += `
        <div class="log-item">
          <div class="log-top">
            <span class="log-date">${formatDate(r.date)}</span>
            <div style="display:flex;align-items:center;gap:8px">
              ${starsHtml(r.rating)}
              <button class="icon-btn danger" style="width:30px;height:30px;border-radius:9px" data-action="del-record" data-id="${r.id}" aria-label="删除这条记录">${SVG.trash}</button>
            </div>
          </div>
          ${r.results && r.results.length ? `<div class="log-tags">${r.results.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
          ${r.comment ? `<div class="log-note">${esc(r.comment)}</div>` : ''}
          ${r.improvement ? `<div class="log-note" style="color:var(--color-accent-deep)">${esc(r.improvement)}</div>` : ''}
        </div>`;
    });
    html += `</div>`;
  }

  if (versions.length > 0) {
    html += sectionTitle('历史版本');
    html += `<button class="card version-row" data-action="view-versions" data-id="${recipe.id}">
      <span>最近更新 ${formatDate(recipe.updatedAt || recipe.createdAt)}</span>
      <span class="version-row-action">查看修改记录 ${SVG.chevR}</span>
    </button>`;
  }

  html += `
    <div class="action-bar">
      <button class="btn btn-secondary" data-action="edit-recipe" data-id="${recipe.id}">${SVG.pencil} 编辑</button>
      <button class="btn btn-primary" data-action="today-cooked" data-id="${recipe.id}">${SVG.check} 今天做过</button>
    </div>
    </div>
  `;

  $('page-detail').innerHTML = html;
}

async function showRecipeMenu(recipeId) {
  const recipe = await getRecipe(recipeId);
  if (!recipe) return;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-sheet-body">
        <div class="modal-handle"></div>
        <div class="modal-title">${esc(recipe.name)}</div>
        <div class="modal-sub">选择要进行的操作</div>
        <div class="menu-card" style="box-shadow:none">
          <button class="menu-row" data-action="edit-recipe" data-id="${recipeId}">
            <span class="menu-ic">${SVG.pencil}</span><span class="menu-label">编辑菜谱</span><span class="menu-arrow">${SVG.chevR}</span>
          </button>
          <button class="menu-row" data-action="copy-recipe" data-id="${recipeId}">
            <span class="menu-ic">${SVG.copy}</span><span class="menu-label">复制菜谱</span><span class="menu-arrow">${SVG.chevR}</span>
          </button>
          <button class="menu-row" data-action="view-versions" data-id="${recipeId}">
            <span class="menu-ic">${SVG.clock}</span><span class="menu-label">查看修改记录</span><span class="menu-arrow">${SVG.chevR}</span>
          </button>
          <button class="menu-row" data-action="delete-recipe" data-id="${recipeId}">
            <span class="menu-ic danger">${SVG.trash}</span><span class="menu-label" style="color:var(--color-danger)">删除菜谱</span><span class="menu-arrow">${SVG.chevR}</span>
          </button>
        </div>
      </div>
      <div class="modal-sheet-footer">
        <button class="btn btn-secondary btn-block" data-action="close-sheet">取消</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

async function copyRecipe(recipeId) {
  try {
    showToast('正在复制…');
    const newId = await duplicateRecipe(recipeId);
    showToast('已复制，改好名字后保存');
    await showEditRecipe(newId);
  } catch (e) {
    showToast('复制失败：' + e.message);
  }
}

/** 删除确认：按 id 查库取菜名，保证从任何入口点都能显示名称 */
async function confirmDeleteRecipe(recipeId) {
  const recipe = await getRecipe(recipeId);
  const name = (recipe && recipe.name) || (App.viewingRecipe && App.viewingRecipe.name) || '这道菜';
  confirmSheet({
    title: `删除「${name}」？`,
    message: '删除后可以在回收站恢复，做菜记录也会一起保留。',
    confirmText: '删除',
    danger: true,
    onConfirm: async () => {
      await deleteRecipe(recipeId);
      showToast('已移入回收站');
      goBack();
      renderCookbook();
    }
  });
}

/** 永久删除确认：同样带上菜名 */
async function confirmPurgeRecipe(recipeId) {
  const recipe = await getRecipe(recipeId);
  const name = (recipe && recipe.name) || '这道菜';
  confirmSheet({
    title: `永久删除「${name}」？`,
    message: '删除后无法恢复，该菜谱的历史版本和做菜记录也会一并删除。',
    confirmText: '永久删除',
    danger: true,
    onConfirm: async () => {
      await purgeRecipe(recipeId);
      showToast('已永久删除');
      showTrash();
      renderProfile();
    }
  });
}

/** 大图查看：点菜谱封面或照片后全屏查看 */
async function showImageViewer(recipeId, startIndex) {
  const recipe = (App.viewingRecipe && App.viewingRecipe.id === recipeId)
    ? App.viewingRecipe
    : await getRecipe(recipeId);
  const images = (recipe && recipe.images) || [];
  if (!images.length) return;

  let index = Math.min(Math.max(0, startIndex || 0), images.length - 1);
  const overlay = document.createElement('div');
  overlay.className = 'image-viewer';
  overlay.innerHTML = `
    <button class="image-viewer-close" data-viewer="close" aria-label="关闭">${SVG.x}</button>
    <div class="image-viewer-stage">
      <img class="image-viewer-img" src="${imageSrc(images[index])}" alt="${esc(recipe.name)}">
    </div>
    ${images.length > 1 ? `
      <div class="image-viewer-bar">
        <button class="image-viewer-nav" data-viewer="prev" aria-label="上一张">${SVG.back}</button>
        <span class="image-viewer-count">${index + 1} / ${images.length}</span>
        <button class="image-viewer-nav" data-viewer="next" aria-label="下一张">${SVG.chevR}</button>
      </div>` : ''}
  `;
  document.body.appendChild(overlay);

  const imgEl = overlay.querySelector('.image-viewer-img');
  const countEl = overlay.querySelector('.image-viewer-count');
  const update = () => {
    imgEl.src = imageSrc(images[index]);
    if (countEl) countEl.textContent = `${index + 1} / ${images.length}`;
  };
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = e => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft' && images.length > 1) { index = (index - 1 + images.length) % images.length; update(); }
    else if (e.key === 'ArrowRight' && images.length > 1) { index = (index + 1) % images.length; update(); }
  };

  overlay.addEventListener('click', e => {
    const action = e.target.closest('[data-viewer]');
    if (!action) {
      if (e.target === overlay || e.target.classList.contains('image-viewer-stage')) close();
      return;
    }
    const kind = action.dataset.viewer;
    if (kind === 'close') close();
    else if (kind === 'prev') { index = (index - 1 + images.length) % images.length; update(); }
    else if (kind === 'next') { index = (index + 1) % images.length; update(); }
  });
  document.addEventListener('keydown', onKey);
}

// ============================================
// 新建 / 编辑菜谱
// ============================================
function showNewRecipe() {
  pushViewState({ view: 'edit', id: null });
  App.editingRecipe = null;
  App.editImages = [];
  App.editDirty = false;
  renderEditForm(null);
  showPage('page-edit');
}

async function showEditRecipe(id) {
  pushViewState({ view: 'edit', id });
  const recipe = await getRecipe(id);
  if (!recipe) return;
  App.editingRecipe = recipe;
  App.editImages = (recipe.images || []).slice();
  App.editDirty = false;
  renderEditForm(recipe);
  showPage('page-edit');
}

async function renderEditForm(recipe) {
  // 先清空旧表单，避免异步加载期间残留上一次的内容
  $('page-edit').innerHTML = '<div class="text-center" style="padding:48px 0;color:var(--color-text-tertiary)">加载中…</div>';

  App.categories = await getCategories();
  App.cookwares = await getCookwares();
  App.actions = await getActions();

  const isEdit = !!recipe;
  const r = recipe || {
    name: '', categoryIds: [], serving: '4人份', images: [],
    ingredients: [], cookwares: [], steps: [{ action: '', heat: '', temperature: '', duration: '', note: '' }]
  };
  const selCats = r.categoryIds || [];
  const selCws = (r.cookwares || []).map(c => (c.name || c));

  let html = `
    <div class="edit-page">
      <div class="edit-topbar">
        <div class="edit-topbar-left">
          <button class="icon-btn" data-action="back" aria-label="返回">${SVG.back}</button>
          <span class="page-title">${isEdit ? '编辑菜谱' : '新建菜谱'}</span>
        </div>
        <button class="link-btn" data-action="save-recipe">保存</button>
      </div>

      <div class="card">
        <div class="form-group">
          <label class="form-label">菜名</label>
          <input class="input" id="edit-name" value="${esc(r.name || '')}" placeholder="例：红烧肉">
        </div>
        <div class="form-group">
          <label class="form-label">简介（选填）</label>
          <textarea class="input" id="edit-description" placeholder="这道菜的一句话说明，例：外婆教的这种做法，甜口。">${esc(r.description || '')}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">分类（可多选）</label>
          <div class="chips-wrap">
            ${App.categories.map(c => `<button type="button" class="chip${selCats.includes(c.name) ? ' on' : ''}" data-action="cat-toggle" data-cat="${esc(c.name)}">${esc(c.name)}</button>`).join('')}
          </div>
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">份量</label>
          <div class="chips-wrap">
            ${['1人份', '2人份', '4人份', '6人份', '8人份'].map(s =>
              `<button type="button" class="chip${r.serving === s ? ' on' : ''}" data-action="serving" data-s="${s}">${s}</button>`).join('')}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">照片（选填）</label>
          <div class="photo-tiles" id="photo-tiles"></div>
          <div class="form-hint photo-hint">第一张照片会作为菜谱封面 · 最多 3 张</div>
          <input type="file" id="photo-input" accept="image/*" multiple class="visually-hidden-input">
        </div>
      </div>

      <div class="card">
        <div class="card-head">${SVG.package} 食材</div>
        <div id="ingredients-list">
          ${(r.ingredients || []).map((ing, i) => ingredientRowHtml(i, ing)).join('')}
        </div>
        <button type="button" class="add-row-btn" data-action="add-ingredient">${SVG.plus} 添加食材</button>
      </div>

      <div class="card">
        <div class="card-head">${SVG.tool} 厨具</div>
        <div class="chips-wrap">
          ${App.cookwares.map(c => `<button type="button" class="chip${selCws.includes(c.name) ? ' on' : ''}" data-action="cw-toggle" data-cw="${esc(c.name)}">${esc(c.name)}</button>`).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-head">${SVG.list} 步骤</div>
        <div id="steps-list">
          ${(r.steps || []).map((s, i) => stepEditorHtml(i, s)).join('')}
        </div>
        <button type="button" class="add-row-btn" data-action="add-step">${SVG.plus} 添加步骤</button>
      </div>

      <div class="action-bar">
        <button class="btn btn-primary" data-action="save-recipe">保存菜谱</button>
      </div>
    </div>
  `;

  $('page-edit').innerHTML = html;
  renderPhotoTiles();
}

function renderPhotoTiles() {
  const container = $('#photo-tiles');
  if (!container) return;
  const full = App.editImages.length >= 3;
  container.innerHTML = App.editImages.map((img, i) => `
    <div class="photo-tile">
      <img src="${imageSrc(img)}" alt="菜品照片">
      ${i === 0 ? '<span class="cover-badge">封面</span>' : ''}
      <button class="remove-photo" data-action="remove-photo" data-i="${i}" aria-label="删除这张照片">${SVG.x}</button>
    </div>`).join('') +
    (full
      ? ''
      : `<button type="button" class="photo-tile add" data-action="add-photo" aria-label="添加照片">${SVG.cam}<span class="photo-add-text">添加照片</span></button>`);
  const hint = container.parentElement && container.parentElement.querySelector('.photo-hint');
  if (hint) hint.textContent = full ? '已经有 3 张照片了，点照片右上角的 ✕ 可以删除' : '第一张照片会作为菜谱封面 · 最多 3 张';
}

function ingredientRowHtml(index, ing) {
  ing = ing || { name: '', amount: '' };
  return `
    <div class="ingredient-row" data-index="${index}">
      <input class="input ing-name" value="${esc(ing.name)}" placeholder="食材名称">
      <input class="input ingredient-amount" value="${esc(ing.amount || '')}" placeholder="用量">
      <div class="row-actions">
        <button type="button" class="icon-btn small" data-action="move-up" aria-label="上移">${SVG.chevUp}</button>
        <button type="button" class="icon-btn small" data-action="move-down" aria-label="下移">${SVG.chevDown}</button>
        <button type="button" class="x-btn" data-action="remove-ingredient" aria-label="删除这行">${SVG.x}</button>
      </div>
    </div>`;
}

function stepEditorHtml(index, step) {
  step = step || { action: '', heat: '', temperature: '', duration: '', note: '' };
  return `
    <div class="step-editor" data-index="${index}">
      <div class="step-editor-head">
        <span class="step-number">${index + 1}</span>
        <span class="step-editor-title">步骤 ${index + 1}</span>
        <div class="row-actions">
          <button type="button" class="icon-btn small" data-action="move-up" aria-label="上移这一步">${SVG.chevUp}</button>
          <button type="button" class="icon-btn small" data-action="move-down" aria-label="下移这一步">${SVG.chevDown}</button>
          <button type="button" class="x-btn" data-action="remove-step" aria-label="删除这一步">${SVG.x}</button>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">动作</label>
        <select class="select step-action">
          <option value="">选择动作</option>
          ${App.actions.map(a => `<option value="${esc(a.name)}"${step.action === a.name ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">火候（选填）</label>
        <div class="chips-wrap">
          ${['小火', '中小火', '中火', '中大火', '大火'].map(h =>
            `<button type="button" class="chip${step.heat === h ? ' on' : ''}" data-action="heat-toggle" data-heat="${h}">${h}</button>`).join('')}
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">时长</label>
          <div class="input-with-unit">
            <input class="input step-duration" value="${esc(step.duration ? step.duration.replace('分钟', '') : '')}" placeholder="如 5" inputmode="numeric">
            <span class="input-unit">分钟</span>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">温度（选填）</label>
          <div class="input-with-unit">
            <input class="input step-temperature" value="${esc(step.temperature ? step.temperature.replace('℃', '') : '')}" placeholder="如 180" inputmode="numeric">
            <span class="input-unit">℃</span>
          </div>
        </div>
      </div>
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">备注</label>
        <textarea class="input step-note" placeholder="例：冷水下锅，撇去浮沫">${esc(step.note || '')}</textarea>
      </div>
    </div>`;
}

async function saveRecipe() {
  const name = $('#edit-name')?.value?.trim();
  if (!name) { showToast('请输入菜名'); return; }

  const description = $('#edit-description')?.value?.trim() || '';

  const categoryIds = [];
  document.querySelectorAll('#page-edit [data-action="cat-toggle"].on').forEach(el => categoryIds.push(el.dataset.cat));
  const serving = document.querySelector('#page-edit [data-action="serving"].on')?.dataset?.s || '4人份';

  const ingredients = [];
  document.querySelectorAll('#ingredients-list .ingredient-row').forEach(row => {
    const ingName = row.querySelector('.ing-name')?.value?.trim();
    const amount = row.querySelector('.ingredient-amount')?.value?.trim();
    if (ingName) ingredients.push({ name: ingName, amount });
  });

  const cookwares = [];
  document.querySelectorAll('#page-edit [data-action="cw-toggle"].on').forEach(el => cookwares.push({ name: el.dataset.cw }));

  const steps = [];
  document.querySelectorAll('#steps-list .step-editor').forEach(el => {
    const action = el.querySelector('.step-action')?.value;
    const heat = el.querySelector('[data-action="heat-toggle"].on')?.dataset?.heat || '';
    const durationRaw = el.querySelector('.step-duration')?.value?.trim();
    const temperatureRaw = el.querySelector('.step-temperature')?.value?.trim();
    const note = el.querySelector('.step-note')?.value?.trim();
    if (action) {
      steps.push({
        action,
        heat,
        duration: durationRaw ? `${durationRaw}分钟` : '',
        temperature: temperatureRaw ? `${temperatureRaw}℃` : '',
        note
      });
    }
  });

  const data = { name, description, categoryIds, serving, images: App.editImages, ingredients, cookwares, steps };

  // 图片用「资源 id」做指纹比较，否则只换照片会被误判成"没有变化"
  const imageSignature = list => (list || [])
    .map(img => (typeof img === 'string' ? `legacy-${img.length}` : (img.id || `${img.width}x${img.height}`)))
    .join(',');

  try {
    if (App.editingRecipe) {
      const old = App.editingRecipe;
      const oldData = {
        name: old.name, description: old.description || '', categoryIds: old.categoryIds || [], serving: old.serving,
        ingredients: old.ingredients, cookwares: old.cookwares, steps: old.steps,
        images: imageSignature(old.images)
      };
      const changed = JSON.stringify({
        name: data.name, description: data.description, categoryIds: data.categoryIds, serving: data.serving,
        ingredients: data.ingredients, cookwares: data.cookwares, steps: data.steps,
        images: imageSignature(data.images)
      }) !== JSON.stringify(oldData);
      if (changed) {
        await saveRecipeWithVersion(old.id, data, '');
        showToast('菜谱已更新');
      } else {
        showToast('没有变化');
      }
      App.editDirty = false;
      goBack();
      renderCookbook();
    } else {
      await createRecipe(data);
      showToast('菜谱创建成功！');
      App.editDirty = false;
      goBack();
      renderCookbook();
    }
  } catch (e) {
    showToast('保存失败：' + e.message);
  }
}

// ============================================
// 做菜记录
// ============================================
function showRecordSheet(recipeId, withSelect, record) {
  const editing = record || null;
  App.editingRecord = editing;
  const initialRating = editing ? (editing.rating || 0) : 0;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-sheet-body">
        <div class="modal-handle"></div>
        <div class="modal-title">${editing ? '修改这条记录' : '记录这次做菜'}</div>
        <div class="modal-sub" id="sheet-sub">${withSelect ? '选择今天做的菜' : esc(App.viewingRecipe?.name || '')}</div>
        <div class="form-group">
          <label class="form-label">菜谱</label>
          <select class="select" id="sheet-recipe">
            ${App.recipes.map(r => `<option value="${r.id}"${r.id === recipeId ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">日期</label>
          <input class="input" id="sheet-date" type="date" value="${editing && editing.date ? editing.date : todayStr()}">
        </div>
        <div class="form-group">
          <label class="form-label">这次做得怎么样？</label>
          <div class="rating-row">
            <div class="stars large" id="sheet-stars">${sheetStarsHtml(initialRating)}</div>
            <span class="rating-text" id="sheet-rating-text">${ratingLabelText(initialRating)}</span>
          </div>
          <div class="form-hint" style="margin-top:6px">点星星左半边＝半星（如 4.5），右半边＝整星；再点一次相同的分数可以取消。</div>
        </div>
        <div class="form-group">
          <label class="form-label">结果</label>
          <div class="chips-wrap" id="sheet-results">
            ${['偏咸', '偏淡', '偏甜', '偏辣', '完美', '太生', '太熟'].map(t =>
              `<button type="button" class="chip${editing && (editing.results || []).includes(t) ? ' on' : ''}" data-action="result-toggle" data-t="${esc(t)}">${t}</button>`).join('')}
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">评价</label>
          <textarea class="input" id="sheet-comment" placeholder="味道如何？家人的反馈？">${editing ? esc(editing.comment || '') : ''}</textarea>
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">改进建议（选填）</label>
          <textarea class="input" id="sheet-improvement" placeholder="下次可以怎么改进？">${editing ? esc(editing.improvement || '') : ''}</textarea>
        </div>
      </div>
      <div class="modal-sheet-footer">
        <button class="btn btn-secondary" style="flex:1" data-action="close-sheet">取消</button>
        <button class="btn btn-primary" style="flex:1" data-action="save-record">保存记录</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  App.sheetRating = initialRating;
  App.sheetResults = editing ? (editing.results || []).slice() : [];

  if (!withSelect) {
    const recipeSel = overlay.querySelector('#sheet-recipe');
    recipeSel.closest('.form-group').style.display = 'none';
  }
}

function closeSheet() {
  document.querySelector('.modal-overlay')?.remove();
}

/** 记录弹窗里的可打分星星（支持半星） */
function sheetStarsHtml(value) {
  return [1, 2, 3, 4, 5].map(i => {
    const cls = value >= i ? 'full' : (value >= i - 0.5 ? 'half' : 'empty');
    return `<button type="button" class="star ${cls}" data-action="star" data-v="${i}" aria-label="${i} 星">★</button>`;
  }).join('');
}

function updateSheetStars() {
  const wrap = $('#sheet-stars');
  if (wrap) wrap.innerHTML = sheetStarsHtml(App.sheetRating);
  const label = $('#sheet-rating-text');
  if (label) label.textContent = ratingLabelText(App.sheetRating);
}

async function saveRecordSheet() {
  const overlay = document.querySelector('.modal-overlay');
  if (!overlay) return;
  const recipeId = +overlay.querySelector('#sheet-recipe')?.value;
  const recipe = App.recipes.find(r => r.id === recipeId);
  if (!recipe) { showToast('请选择菜谱'); return; }

  const versions = await getVersions(recipeId);
  const currentVersion = versions[versions.length - 1];

  const payload = {
    recipeId,
    versionId: currentVersion?.id || null,
    date: overlay.querySelector('#sheet-date')?.value || todayStr(),
    rating: App.sheetRating,
    results: App.sheetResults.slice(),
    comment: overlay.querySelector('#sheet-comment')?.value?.trim(),
    improvement: overlay.querySelector('#sheet-improvement')?.value?.trim()
  };
  const editing = App.editingRecord;
  const improvement = payload.improvement;
  if (editing) {
    await updateCookRecord(editing.id, payload);
  } else {
    await createCookRecord(payload);
  }

  overlay.remove();
  showToast(editing ? '记录已更新' : '记录已保存');
  App.editingRecord = null;
  if (App.currentPage === 'page-detail') {
    showRecipeDetail(recipeId);
  } else {
    renderRecords();
  }

  if (improvement && !editing) {
    confirmSheet({
      title: '检测到新的经验',
      message: `<div class="text-secondary" style="font-size: 0.875rem;line-height:1.6">根据这次的记录，是否现在修改菜谱？</div>
        <div style="background:var(--color-surface-soft);border-radius:12px;padding:12px;margin-top:12px;font-size: 0.875rem;line-height:1.6">${esc(improvement)}</div>`,
      confirmText: '去修改菜谱',
      cancelText: '稍后再说',
      onConfirm: () => showEditRecipe(recipeId)
    });
  }
}

// ============================================
// 记录页
// ============================================
async function renderRecords() {
  const records = await getAllCookRecords();
  App.recipes = await getAllRecipes();

  const container = $('records-content');
  const recipeMap = {};
  App.recipes.forEach(r => recipeMap[r.id] = r);

  const stats = await getHomeStats();
  const mostFreq = stats.frequent[0];
  // 按菜谱筛选（只列出有记录的菜谱）
  const recipeOptions = [...new Set(records.map(r => r.recipeId))]
    .map(id => recipeMap[id] ? { id, name: recipeMap[id].name } : null)
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  const filtered = App.recordsFilterRecipeId
    ? records.filter(r => r.recipeId === App.recordsFilterRecipeId)
    : records;

  let html = '';
  html += `
    <div class="flex-between" style="margin-bottom:14px">
      <div style="display:flex;align-items:baseline;gap:8px">
        <span class="page-title">做菜记录</span>
        <span class="page-count">${App.recordsFilterRecipeId ? `筛选出 ${filtered.length} 条` : `共 ${records.length} 条`}</span>
      </div>
      <button class="btn btn-sm btn-primary" data-action="record-sheet">${SVG.plus} 记一笔</button>
    </div>
  `;

  html += `
    <div class="stats-card">
      <div class="stat"><span class="stat-value">${stats.monthCount}</span><span class="stat-label">本月做过</span></div>
      <div class="stat"><span class="stat-value">${mostFreq ? mostFreq.totalCookCount : 0}</span><span class="stat-label">最常做<br>${mostFreq ? esc(mostFreq.name) : '—'}</span></div>
      <div class="stat"><span class="stat-value">${stats.avgRating}</span><span class="stat-label">平均评分</span></div>
    </div>
  `;

  if (records.length > 0 && recipeOptions.length > 1) {
    html += `
      <div style="margin-top:14px">
        <select class="select" id="records-recipe-filter" aria-label="按菜谱筛选记录">
          <option value="">全部菜谱（${records.length} 条记录）</option>
          ${recipeOptions.map(o => `<option value="${o.id}"${App.recordsFilterRecipeId === o.id ? ' selected' : ''}>${esc(o.name)}</option>`).join('')}
        </select>
      </div>
    `;
  }

  if (records.length === 0) {
    html += `
      <div class="empty-state">
        <div class="empty-state-icon">${SVG.clipboard}</div>
        <div class="empty-state-text">还没有做菜记录<br>做完菜记得回来记一笔</div>
        <button class="btn btn-primary" data-action="record-sheet">${SVG.plus} 记录今天</button>
      </div>`;
  } else if (filtered.length === 0) {
    html += `<div class="empty-state"><div class="empty-state-icon">${SVG.inbox}</div><div class="empty-state-text">这道菜还没有记录</div></div>`;
  } else {
    // 按月分组，默认展开当月，其余可收起
    const months = [];
    const monthMap = new Map();
    for (const r of filtered) {
      const monthKey = String(r.date || '').slice(0, 7);
      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, []);
        months.push(monthKey);
      }
      monthMap.get(monthKey).push(r);
    }
    const thisMonth = todayStr().slice(0, 7);

    for (const monthKey of months) {
      const items = monthMap.get(monthKey);
      const collapsed = App.collapsedMonths.includes(monthKey);
      const month = monthKey.split('-')[1];
      html += `
        <button class="record-group-title month-toggle" data-action="toggle-month" data-month="${monthKey}" aria-expanded="${!collapsed}">
          <span class="bar"></span>${Number(month)} 月 · ${items.length} 次
          <span class="month-arrow${collapsed ? ' collapsed' : ''}">${SVG.chevDown}</span>
        </button>`;
      if (collapsed) continue;
      html += `<div class="card">`;
      for (const r of items) {
        const recipe = recipeMap[r.recipeId];
        html += `
          <div class="log-item">
            <div class="log-top">
              <span class="log-name" data-action="open-recipe" data-id="${r.recipeId}" style="cursor:pointer">${recipe ? esc(recipe.name) : '已删除的菜谱'}</span>
              <div style="display:flex;align-items:center;gap:8px">
                ${starsHtml(r.rating)}
                <button class="icon-btn" style="width:30px;height:30px;border-radius:9px" data-action="edit-record" data-id="${r.id}" aria-label="修改这条记录">${SVG.pencil}</button>
                <button class="icon-btn danger" style="width:30px;height:30px;border-radius:9px" data-action="del-record" data-id="${r.id}" aria-label="删除这条记录">${SVG.trash}</button>
              </div>
            </div>
            <div class="log-date" style="margin-top:2px">${friendlyDate(r.date)}</div>
            ${r.results && r.results.length ? `<div class="log-tags">${r.results.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
            ${r.comment ? `<div class="log-note">${esc(r.comment)}</div>` : ''}
            ${r.improvement ? `<div class="log-note" style="color:var(--color-accent-deep)">${esc(r.improvement)}</div>` : ''}
          </div>`;
      }
      html += `</div>`;
    }
  }

  container.innerHTML = html;

  const filterSelect = $('#records-recipe-filter');
  if (filterSelect) {
    filterSelect.addEventListener('change', () => {
      App.recordsFilterRecipeId = filterSelect.value ? +filterSelect.value : null;
      renderRecords();
    });
  }
}

// ============================================
// 我的页面
// ============================================

// ============================================
// 菜谱统计
// ============================================
function barHeight(count, max, scale) {
  if (!count) return 3;
  return Math.max(8, Math.round(count / max * scale));
}

function distRow(label, count, max, muted) {
  const width = count === 0 ? 0 : (max ? Math.max(4, Math.round(count / max * 100)) : 4);
  return `
    <div class="dist-row">
      <span class="dist-label">${esc(label)}</span>
      <div class="dist-track"><div class="dist-fill${muted ? ' muted' : ''}" style="width:${width}%"></div></div>
      <span class="dist-count">${count}</span>
    </div>`;
}

async function showStats() {
  pushViewState({ view: 'stats' });
  showPage('page-stats');
  const s = await getStatsSummary();

  const maxMonthly = Math.max(1, ...s.monthly.map(m => m.count));
  const ratingMax = Math.max(1, s.ratingDist[5], s.ratingDist[4], s.ratingDist[3], s.ratingDist[2], s.ratingDist[1], s.ratingDist.unrated);
  const catMax = Math.max(1, ...s.categoryDist.map(c => c[1]));

  let html = `
    <div class="detail-page">
      <div class="detail-topbar">
        <div class="detail-topbar-left">
          <button class="icon-btn" data-action="back" aria-label="返回">${SVG.back}</button>
          <span class="page-title">菜谱统计</span>
        </div>
      </div>

      <div class="stats-card stats-2x2">
        <div class="stat"><span class="stat-value">${s.recipeCount}</span><span class="stat-label">菜谱总数</span></div>
        <div class="stat"><span class="stat-value">${s.recordCount}</span><span class="stat-label">做菜记录</span></div>
        <div class="stat"><span class="stat-value">${s.avgRating || '—'}</span><span class="stat-label">平均评分</span></div>
        <div class="stat"><span class="stat-value">${s.lastCookDays == null ? '—' : s.lastCookDays}</span><span class="stat-label">天前做过</span></div>
      </div>
      <div class="form-hint" style="margin-top:8px">平均评分按每次做菜记录计算，没打分的记录不参与统计${s.avgRatingSample ? `（共 ${s.avgRatingSample} 次评分）` : ''}。</div>

      ${sectionTitle('近 6 个月做菜趋势')}
      <div class="card">
        ${s.recordCount
          ? `<div class="chart">${s.monthly.map(m => `
              <div class="chart-col${m.isCurrent ? ' is-current' : ''}">
                <span class="chart-value">${m.count}</span>
                <div class="chart-bar" style="height:${barHeight(m.count, maxMonthly, 100)}px"></div>
                <span class="chart-label">${m.month}月</span>
              </div>`).join('')}</div>`
          : `<div class="text-secondary" style="font-size: 0.875rem">还没有做菜记录，做一次菜记一笔就能看到趋势。</div>`}
      </div>
      ${s.recordCount ? '<div class="form-hint" style="margin-top:8px">本月尚未结束，数字会继续增加。</div>' : ''}

      ${sectionTitle('最常做 Top 5')}
      <div class="card">
        ${s.topFrequent.length
          ? s.topFrequent.map((item, i) => `
              <button class="rank-row" data-action="open-recipe" data-id="${item.recipe.id}">
                <span class="rank-no">${i + 1}</span>
                <span class="rank-name">${esc(item.recipe.name)}</span>
                <span class="rank-times">${item.times} 次</span>
                <span class="stars rank-stars">${starsHtml(item.recipe.averageRating)}</span>
              </button>`).join('')
          : `<div class="text-secondary" style="font-size: 0.875rem">还没有做过的菜。</div>`}
      </div>

      ${sectionTitle('评分分布')}
      <div class="card">
        ${[5, 4, 3, 2, 1].map(star => distRow(`${star} 星`, s.ratingDist[star], ratingMax, false)).join('')}
        ${distRow('未评分', s.ratingDist.unrated, ratingMax, true)}
      </div>
      <div class="form-hint" style="margin-top:8px">支持半星：4.5 分及以上计入 5 星，3.5~4.4 分计入 4 星，依此类推。</div>

      ${sectionTitle('做菜结果')}
      <div class="card">
        ${s.resultTags.length
          ? `<div class="tag-line">${s.resultTags.map(([tag, count]) => `<span class="tag">${esc(tag)} ${count}</span>`).join('')}</div>`
          : `<div class="text-secondary" style="font-size: 0.875rem">记录时勾选过「结果」标签，这里就会显示统计。</div>`}
      </div>

      ${sectionTitle('分类分布')}
      <div class="card">
        ${s.categoryDist.length
          ? s.categoryDist.map(([name, count]) => distRow(name, count, catMax, false)).join('')
          : `<div class="text-secondary" style="font-size: 0.875rem">还没有菜谱分类。</div>`}
      </div>
      <div class="form-hint" style="margin-top:8px">一道菜可以属于多个分类，所以这里的合计会大于菜谱总数。</div>

      ${sectionTitle('其他')}
      <div class="card">
        <div class="fact-row"><span>平均每周做菜</span><span class="fact-value">${s.avgPerWeek} 次</span></div>
        <div class="fact-row"><span>最久没做</span><span class="fact-value">${s.longestNotCooked ? `${esc(s.longestNotCooked.name)} · ${s.longestNotCooked.days} 天前` : '—'}</span></div>
        <div class="fact-row"><span>从未做过</span><span class="fact-value">${s.neverCooked} 道</span></div>
        <div class="fact-row"><span>菜谱修改次数</span><span class="fact-value">${s.editCount} 次</span></div>
      </div>
      <div class="form-hint" style="margin-top:8px">修改次数按当前菜谱的历史版本统计，不含回收站里的菜谱。</div>
    </div>
  `;
  $('page-stats').innerHTML = html;
}

async function renderProfile() {
  App.recipes = await getAllRecipes();
  App.categories = await getCategories();
  App.cookwares = await getCookwares();
  App.actions = await getActions();

  const totalRecords = await DB.cookRecords.count();
  const trashCount = (await getTrashRecipes()).length;
  const stats = await getHomeStats();

  const container = $('profile-content');
  let html = '';
  html += `
    <div class="flex-between" style="margin-bottom:14px">
      <span class="page-title">我的</span>
    </div>

    <div class="stats-card">
      <div class="stat"><span class="stat-value">${App.recipes.length}</span><span class="stat-label">菜谱</span></div>
      <div class="stat"><span class="stat-value">${totalRecords}</span><span class="stat-label">做菜记录</span></div>
      <div class="stat"><span class="stat-value">${stats.avgRating}</span><span class="stat-label">平均评分</span></div>
    </div>

    <div style="height:14px"></div>

    <div class="menu-card">
      ${menuRow('chart', '菜谱统计', `${App.recipes.length} 道菜`, 'open-stats')}
      ${menuRow('folder', '分类管理', `${App.categories.length} 个`, 'open-category-manager')}
      ${menuRow('sliders', '厨具管理', `${App.cookwares.length} 件`, 'open-cookware-manager')}
      ${menuRow('zap', '动作管理', `${App.actions.length} 个`, 'open-action-manager')}
    </div>

    <div class="menu-card">
      ${menuRow('download', '导出备份', backupStatus().text, 'export-data', backupStatus().warn)}
      ${menuRow('upload', '导入数据', '', 'import-data')}
      ${menuRow('trash', '回收站', trashCount ? `${trashCount} 项` : '空', 'open-trash')}
    </div>
    <div class="form-hint" style="margin:-4px 0 12px 2px">备份文件（.cookbook）包含全部菜谱、做菜记录和照片，可以随时导入恢复。</div>

    <div class="menu-card">
      ${menuRow('type', '字号大小', localStorage.getItem('my-recipes-font-size') || '标准', 'font-size')}
      ${menuRow('bell', '备份提醒', localStorage.getItem('my-recipes-backup-remind') === 'off' ? '关' : '开', 'backup-remind')}
    </div>

    <div class="foot-note">数据保存在这台手机里<br>记得定期导出备份</div>
  `;

  container.innerHTML = html;
}

function menuRow(iconKey, label, value, action, warn) {
  return `
    <button class="menu-row" data-action="${action}">
      <span class="menu-ic">${SVG[iconKey] || ''}</span>
      <span class="menu-label">${esc(label)}</span>
      <span class="menu-value${warn ? ' warn' : ''}">${esc(value)}</span>
      <span class="menu-arrow">${SVG.chevR}</span>
    </button>`;
}

// ============================================
// 备份导出 / 导入（.cookbook 档案）
// ============================================
async function exportData() {
  showToast('正在打包备份…');
  try {
    const info = await exportArchive();
    showToast(`已导出 ${info.recipes} 道菜谱（${formatFileSize(info.size)}）`);
    renderProfile();
  } catch (e) {
    showToast('导出失败：' + e.message);
  }
}

function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.cookbook,.zip,.json,application/zip,application/json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    showToast('正在读取备份…');
    try {
      const parsed = await parseArchiveFile(file);
      if (parsed.legacy) {
        confirmSheet({
          title: '这是旧版 JSON 备份',
          message: `导入后会替换本机当前的全部数据。${parsed.json.exportDate ? `<br>备份时间：${formatDate(parsed.json.exportDate)}` : ''}`,
          confirmText: '导入并替换',
          danger: true,
          onConfirm: async () => {
            await autoBackupBeforeImport();
            const res = await importLegacyJson(parsed.json);
            showToast(`已导入 ${res.recipes} 道菜谱，正在刷新…`);
            setTimeout(() => location.reload(), 1200);
          }
        });
        return;
      }
      await showImportSheet(parsed);
    } catch (err) {
      showToast(err.message);
    }
  };
  input.click();
}

async function autoBackupBeforeImport() {
  try {
    const info = await exportArchive();
    showToast(`已先备份当前数据（${formatFileSize(info.size)}）`);
  } catch (e) {
    // 自动备份失败不阻塞导入
  }
}

async function showImportSheet(parsed) {
  const preview = await previewArchiveMerge(parsed.data);
  const manifest = parsed.manifest;
  const exportedAt = manifest.exportedAt ? formatDateTime(manifest.exportedAt) : '未知时间';
  let mode = 'merge';
  let ack = false;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-sheet-body">
        <div class="modal-handle"></div>
        <div class="modal-title">导入备份</div>
        <div class="modal-sub">导出于 ${esc(exportedAt)}</div>

        <div class="card" style="margin-bottom:14px">
          <div class="ing-row"><span>菜谱</span><span class="ing-amount">${preview.totalRecipes} 道</span></div>
          <div class="ing-row"><span>做菜记录</span><span class="ing-amount">${preview.totalRecords} 条</span></div>
          <div class="ing-row"><span>照片</span><span class="ing-amount">${preview.totalMedia} 张</span></div>
        </div>

        <div class="form-group">
          <label class="form-label">导入方式</label>
          <div class="chips-wrap">
            <button type="button" class="chip on" data-mode="merge">合并导入</button>
            <button type="button" class="chip" data-mode="replace">覆盖替换</button>
          </div>
        </div>

        <div id="import-hint" class="form-hint"></div>
        <div id="import-ack-wrap" style="display:none;margin-top:12px">
          <label class="chip" style="height:auto;padding:12px 14px;display:flex;gap:8px;align-items:flex-start;line-height:1.5;white-space:normal">
            <input type="checkbox" id="import-ack" style="width:20px;height:20px;margin-top:2px">
            <span style="font-size: 0.875rem">我确认要清空本机现有数据，用备份内容替换</span>
          </label>
        </div>
      </div>
      <div class="modal-sheet-footer">
        <button class="btn btn-secondary" style="flex:1" data-action="close-sheet">取消</button>
        <button class="btn btn-primary" style="flex:1" id="import-confirm">确认导入</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const hint = overlay.querySelector('#import-hint');
  const ackWrap = overlay.querySelector('#import-ack-wrap');
  const ackBox = overlay.querySelector('#import-ack');
  const confirmBtn = overlay.querySelector('#import-confirm');

  const refresh = () => {
    const isReplace = mode === 'replace';
    hint.innerHTML = isReplace
      ? '<span style="color:var(--color-danger)">覆盖替换会清空本机当前的菜谱、记录和照片，仅保留备份里的内容。</span>'
      : `将新增 <b>${preview.newRecipes}</b> 道菜谱、<b>${preview.newRecords}</b> 条记录${preview.renamedRecipes ? `，其中 <b>${preview.renamedRecipes}</b> 道与本机重名（内容不同）会另存为副本` : ''}；完全相同（同名同内容）的 <b>${preview.duplicateRecipes}</b> 道菜谱和 <b>${preview.duplicateRecords}</b> 条记录会自动跳过。`;
    ackWrap.style.display = isReplace ? 'block' : 'none';
    confirmBtn.className = `btn ${isReplace ? 'btn-danger' : 'btn-primary'}`;
    confirmBtn.style.flex = '1';
    confirmBtn.disabled = isReplace && !ack;
    confirmBtn.style.opacity = confirmBtn.disabled ? '0.5' : '1';
  };

  overlay.querySelectorAll('[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      mode = btn.dataset.mode;
      overlay.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b === btn));
      refresh();
    });
  });
  ackBox.addEventListener('change', () => { ack = ackBox.checked; refresh(); });
  confirmBtn.addEventListener('click', async () => {
    if (mode === 'replace' && !ack) return;
    confirmBtn.disabled = true;
    confirmBtn.textContent = '导入中…';
    try {
      await autoBackupBeforeImport();
      if (mode === 'replace') {
        const res = await importArchiveReplace(parsed);
        showToast(`已替换导入 ${res.recipes} 道菜谱，正在刷新…`);
      } else {
        const res = await importArchiveMerge(parsed);
        showToast(`已新增 ${res.addedRecipes} 道菜谱（含 ${res.renamedRecipes} 道重名副本）、${res.addedRecords} 条记录，跳过重复 ${res.skippedRecipes} 道`);
      }
      overlay.remove();
      setTimeout(() => location.reload(), 1400);
    } catch (err) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = '确认导入';
      showToast('导入失败：' + err.message);
    }
  });
  refresh();
}

// ============================================
// 全局事件委托
// ============================================
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  const id = el.dataset.id ? +el.dataset.id : null;

  switch (action) {
    case 'open-recipe':
      showRecipeDetail(id);
      break;
    case 'edit-recipe':
      closeSheet();
      showEditRecipe(id);
      break;
    case 'new-recipe':
      showNewRecipe();
      break;
    case 'go-cookbook':
      switchTab('cookbook');
      break;
    case 'back':
      goBack();
      break;
    case 'back-detail':
      if (window.history.state && window.history.state.view) window.history.back();
      else showRecipeDetail(id);
      break;
    case 'view-card':
      App.recipeView = 'card';
      renderCookbook();
      break;
    case 'view-list':
      App.recipeView = 'list';
      renderCookbook();
      break;
    case 'open-filter-sheet':
      showFilterSheet();
      break;
    case 'clear-filters':
      App.filters = newFilters();
      renderCookbook();
      break;
    case 'delete-recipe':
      closeSheet();
      confirmDeleteRecipe(id);
      break;
    case 'restore':
      restoreRecipe(id).then(() => { showToast('已恢复'); showTrash(); renderProfile(); });
      break;
    case 'purge':
      confirmPurgeRecipe(id);
      break;
    case 'purge-all':
      confirmSheet({
        title: '清空回收站？',
        message: '里面的菜谱会连同历史版本和做菜记录一起永久删除，无法恢复。',
        confirmText: '清空',
        danger: true,
        onConfirm: async () => {
          const removed = await purgeAllTrash();
          showToast(`已清空 ${removed} 个菜谱`);
          showTrash();
          renderProfile();
        }
      });
      break;
    case 'open-trash':
      showTrash();
      break;
    case 'open-stats':
      showStats();
      break;
    case 'open-photo':
      showImageViewer(id, +el.dataset.index || 0);
      break;
    case 'view-versions':
      closeSheet();
      showVersions(id);
      break;
    case 'view-version':
      showVersionDetail(id);
      break;
    case 'today-cooked':
      showRecordSheet(id, false);
      break;
    case 'record-sheet':
      showRecordSheet(null, true);
      break;
    case 'close-sheet':
      closeSheet();
      break;
    case 'save-record':
      saveRecordSheet();
      break;
    case 'star': {
      const starIndex = +el.dataset.v;
      const rect = el.getBoundingClientRect();
      const leftHalf = (e.clientX - rect.left) < rect.width / 2;
      const value = leftHalf ? starIndex - 0.5 : starIndex;
      // 再点一次相同的分数 = 取消评分
      App.sheetRating = App.sheetRating === value ? 0 : value;
      updateSheetStars();
      break;
    }
    case 'result-toggle': {
      const t = el.dataset.t;
      const idx = App.sheetResults.indexOf(t);
      if (idx >= 0) App.sheetResults.splice(idx, 1); else App.sheetResults.push(t);
      el.classList.toggle('on');
      break;
    }
    case 'del-record':
      confirmSheet({
        title: '删除这条记录？',
        message: '删除后不可恢复。',
        confirmText: '删除',
        danger: true,
        onConfirm: async () => {
          await deleteCookRecord(id);
          showToast('记录已删除');
          if (App.currentPage === 'page-detail') showRecipeDetail(App.viewingRecipe?.id);
          else renderRecords();
        }
      });
      break;
    case 'cat-toggle':
      el.classList.toggle('on');
      markDirty();
      break;
    case 'serving':
      document.querySelectorAll('#page-edit [data-action="serving"]').forEach(b => b.classList.remove('on'));
      el.classList.add('on');
      markDirty();
      break;
    case 'cw-toggle':
      el.classList.toggle('on');
      markDirty();
      break;
    case 'heat-toggle':
      if (el.classList.contains('on')) {
        el.classList.remove('on');
      } else {
        el.closest('.step-editor').querySelectorAll('[data-action="heat-toggle"]').forEach(b => b.classList.remove('on'));
        el.classList.add('on');
      }
      markDirty();
      break;
    case 'add-ingredient': {
      const list = $('#ingredients-list');
      list.insertAdjacentHTML('beforeend', ingredientRowHtml(list.children.length, null));
      markDirty();
      break;
    }
    case 'remove-ingredient':
      el.closest('.ingredient-row').remove();
      markDirty();
      break;
    case 'add-step': {
      const list = $('#steps-list');
      list.insertAdjacentHTML('beforeend', stepEditorHtml(list.children.length, null));
      markDirty();
      break;
    }
    case 'remove-step':
      el.closest('.step-editor').remove();
      document.querySelectorAll('#steps-list .step-editor').forEach((editor, i) => {
        editor.querySelector('.step-number').textContent = i + 1;
        editor.querySelector('.step-editor-title').textContent = `步骤 ${i + 1}`;
        editor.dataset.index = i;
      });
      markDirty();
      break;
    case 'move-up':
    case 'move-down': {
      const row = el.closest('.ingredient-row') || el.closest('.step-editor');
      if (!row) break;
      const parent = row.parentElement;
      if (action === 'move-up' && row.previousElementSibling) {
        parent.insertBefore(row, row.previousElementSibling);
      } else if (action === 'move-down' && row.nextElementSibling) {
        parent.insertBefore(row.nextElementSibling, row);
      }
      document.querySelectorAll('#steps-list .step-editor').forEach((editor, i) => {
        editor.querySelector('.step-number').textContent = i + 1;
        editor.querySelector('.step-editor-title').textContent = `步骤 ${i + 1}`;
        editor.dataset.index = i;
      });
      markDirty();
      break;
    }
    case 'add-photo':
      $('#photo-input')?.click();
      break;
    case 'remove-photo':
      App.editImages.splice(+el.dataset.i, 1);
      renderPhotoTiles();
      markDirty();
      break;
    case 'save-recipe':
      saveRecipe();
      break;
    case 'unsaved-save':
      closeSheet();
      saveRecipe();
      break;
    case 'unsaved-discard':
      closeSheet();
      App.editDirty = false;
      switchTab(App.fromPage || 'home');
      break;
    case 'unsaved-cancel':
      closeSheet();
      break;
    case 'recipe-menu':
      showRecipeMenu(id);
      break;
    case 'copy-recipe':
      closeSheet();
      copyRecipe(id);
      break;
    case 'restore-version':
      restoreVersion(id);
      break;
    case 'edit-record':
      getCookRecord(id).then(record => {
        if (!record) return;
        App.viewingRecipe = App.recipes.find(r => r.id === record.recipeId) || App.viewingRecipe;
        showRecordSheet(record.recipeId, false, record);
      });
      break;
    case 'toggle-month': {
      const month = el.dataset.month;
      const idx = App.collapsedMonths.indexOf(month);
      if (idx >= 0) App.collapsedMonths.splice(idx, 1);
      else App.collapsedMonths.push(month);
      renderRecords();
      break;
    }
    case 'sort-recipes':
      App.sortMode = el.dataset.sort;
      renderCookbook();
      break;
    case 'welcome-dismiss':
      localStorage.setItem('my-recipes-welcomed', '1');
      closeSheet();
      break;
    case 'welcome-sample':
      localStorage.setItem('my-recipes-welcomed', '1');
      addSampleRecipe()
        .then(() => {
          closeSheet();
          showToast('示例菜谱已添加');
          renderHome();
        })
        .catch(() => showToast('添加失败，请稍后再试'));
      break;
    case 'manager-rename': {
      const row = el.closest('.flex-between');
      const type = el.dataset.type;
      const targetId = +el.dataset.id;
      const current = row.querySelector('span').textContent.trim();
      row.innerHTML = `
        <input class="input" style="flex:1;height:44px" value="${esc(current)}" aria-label="新名称">
        <button class="btn btn-primary btn-sm" data-action="manager-rename-save" data-type="${type}" data-id="${targetId}">保存</button>
        <button class="btn btn-secondary btn-sm" data-action="manager-rename-cancel" data-type="${type}">取消</button>`;
      row.querySelector('input').focus();
      break;
    }
    case 'manager-rename-cancel':
      closeSheet();
      if (el.dataset.type === 'category') showCategoryManager();
      else if (el.dataset.type === 'cookware') showCookwareManager();
      else showActionManager();
      break;
    case 'manager-rename-save': {
      const row = el.closest('.flex-between');
      const newName = row.querySelector('input')?.value?.trim();
      const type = el.dataset.type;
      const targetId = +el.dataset.id;
      const fn = type === 'category' ? renameCategory : type === 'cookware' ? renameCookware : renameAction;
      fn(targetId, newName)
        .then(() => {
          showToast('已改名');
          closeSheet();
          if (type === 'category') showCategoryManager();
          else if (type === 'cookware') showCookwareManager();
          else showActionManager();
        })
        .catch(err => showToast(err.message));
      break;
    }
    case 'open-category-manager':
      showCategoryManager();
      break;
    case 'open-cookware-manager':
      showCookwareManager();
      break;
    case 'open-action-manager':
      showActionManager();
      break;
    case 'manager-del': {
      const type = el.dataset.type;
      const targetId = +el.dataset.id;
      const fn = type === 'category' ? deleteCategory : type === 'cookware' ? deleteCookware : deleteAction;
      fn(targetId)
        .then(() => {
          showToast('已删除');
          closeSheet();
          renderProfile();
          if (type === 'category') showCategoryManager();
          else if (type === 'cookware') showCookwareManager();
          else showActionManager();
        })
        .catch(err => showToast(err.message));
      break;
    }
    case 'export-data':
      exportData();
      break;
    case 'import-data':
      importData();
      break;
    case 'font-size': {
      const levels = ['标准', '大', '特大'];
      const cur = localStorage.getItem('my-recipes-font-size') || '标准';
      const next = levels[(levels.indexOf(cur) + 1) % levels.length];
      applyFontSize(next);
      showToast(`字号已调整为「${next}」`);
      renderProfile();
      break;
    }
    case 'backup-remind': {
      const cur = localStorage.getItem('my-recipes-backup-remind') === 'off';
      localStorage.setItem('my-recipes-backup-remind', cur ? 'on' : 'off');
      showToast(cur ? '备份提醒已开启' : '备份提醒已关闭');
      renderProfile();
      break;
    }
  }
});

// 照片上传：生成 display（最大 1280）+ thumbnail（最大 320）两张，以二进制存入
document.addEventListener('change', async e => {
  const input = e.target;
  if (!input || input.id !== 'photo-input' || !input.files || !input.files.length) return;

  const room = 3 - App.editImages.length;
  if (room <= 0) {
    input.value = '';
    showToast('最多只能放 3 张照片');
    return;
  }
  const files = Array.from(input.files).slice(0, room);
  showToast('正在处理照片…');

  let added = 0;
  let failed = 0;
  let unsupported = false;
  for (const file of files) {
    try {
      if (isUnsupportedImage(file)) {
        unsupported = true;
        continue;
      }
      App.editImages.push(await makeImageAsset(file));
      added += 1;
    } catch (err) {
      failed += 1;
      console.warn('照片处理失败：', file && file.name, err);
    }
  }
  // 处理完再清空，避免个别浏览器在读文件前清空导致读取失败
  input.value = '';

  if (added) {
    renderPhotoTiles();
    markDirty();
  }
  if (unsupported || failed) {
    showToast(added ? '部分照片格式不支持（iPhone 的 HEIC 需先转成 JPG）' : '这张照片格式不支持，iPhone 的 HEIC 照片请先在相册里转成 JPG');
  } else if (added) {
    showToast(`已添加 ${added} 张照片`);
  }
});

/** iPhone 默认的 HEIC/HEIF 浏览器无法解码，提前给明确提示 */
function isUnsupportedImage(file) {
  const type = String((file && file.type) || '').toLowerCase();
  const name = String((file && file.name) || '').toLowerCase();
  return type.includes('heic') || type.includes('heif') || /\.(heic|heif)$/.test(name);
}

// ============================================
// 启动
// ============================================
document.addEventListener('DOMContentLoaded', init);
