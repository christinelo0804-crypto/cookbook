/* ============================================
   我家菜谱 - 管理页（分类 / 厨具 / 动作 / 回收站 / 历史版本）
   ============================================ */

// ============================================
// 管理弹窗：分类 / 厨具 / 动作
// ============================================
function showManager(title, listHtml, addRowHtml, onAdd) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-sheet-body">
        <div class="modal-handle"></div>
        <div class="modal-title">${esc(title)}</div>
        <div style="margin-bottom:12px" id="manager-list">${listHtml}</div>
        <div style="display:flex;gap:8px" id="manager-add">${addRowHtml}</div>
      </div>
      <div class="modal-sheet-footer">
        <button class="btn btn-secondary btn-block" data-action="close-sheet">完成</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#manager-add').querySelector('button[data-action="manager-add"]').addEventListener('click', onAdd);
}

/** 厨具 / 动作每一行下面的「这个能用哪些参数」开关 */
function paramChipsHtml(type, id, params) {
  const on = params || [];
  return `<div class="chips-wrap" style="margin-top:8px">
    ${STEP_PARAMS.map(p => `<button type="button" class="chip chip-sm${on.includes(p) ? ' on' : ''}" data-action="manager-param" data-type="${type}" data-id="${id}" data-param="${p}">${PARAM_LABELS[p]}</button>`).join('')}
  </div>`;
}

/** 管理页一行：名字 + 改名/删除按钮 +（可选）参数开关 */
function managerRowHtml({ type, id, title, note = '', params = null }) {
  return `
    <div style="padding:12px 0;border-bottom:1px solid var(--color-line)">
      <div class="flex-between">
        <span style="font-size: 1rem">${title}${note}</span>
        <div class="row-actions">
          <button class="icon-btn" style="width:32px;height:32px;border-radius:10px" data-action="manager-rename" data-id="${id}" data-type="${type}" aria-label="改名">${SVG.pencil}</button>
          <button class="icon-btn danger" style="width:32px;height:32px;border-radius:10px" data-action="manager-del" data-id="${id}" data-type="${type}" aria-label="删除">${SVG.trash}</button>
        </div>
      </div>
      ${params ? paramChipsHtml(type, id, params) : ''}
    </div>`;
}

async function showCategoryManager() {
  const cats = await getCategories();
  showManager(
    '分类管理',
    cats.map(c => `
      <div class="flex-between" style="padding:12px 0;border-bottom:1px solid var(--color-line)">
        <span style="font-size: 1rem">${esc(c.name)}</span>
        <div class="row-actions">
          <button class="icon-btn" style="width:32px;height:32px;border-radius:10px" data-action="manager-rename" data-id="${c.id}" data-type="category" aria-label="给这个分类改名">${SVG.pencil}</button>
          <button class="icon-btn danger" style="width:32px;height:32px;border-radius:10px" data-action="manager-del" data-id="${c.id}" data-type="category" aria-label="删除这个分类">${SVG.trash}</button>
        </div>
      </div>`).join(''),
    `<input class="input" id="manager-name" placeholder="新分类名称" style="flex:1;height:44px">
     <button class="btn btn-primary btn-sm" data-action="manager-add">添加</button>`,
    async () => {
      const input = document.getElementById('manager-name');
      const name = input?.value?.trim();
      if (!name) { showFieldError(input, '请先填分类名称'); return; }
      try {
        await addCategory(name, '');
      } catch (err) {
        showFieldError(input, err.message);
        return;
      }
      showToast('分类已添加', { tone: 'success' });
      closeSheet();
      renderProfile();
    }
  );
}

async function showCookwareManager() {
  const list = await getCookwares();
  showManager(
    '厨具管理',
    list.map(c => managerRowHtml({
      type: 'cookware',
      id: c.id,
      title: esc(c.name),
      note: ` <span class="text-tertiary" style="font-size: 0.8125rem">(${esc(c.type)})</span>`,
      params: c.params
    })).join(''),
    `<input class="input" id="manager-name" placeholder="厨具名称" style="flex:1;height:44px">
     ${selectButtonHtml({
       id: 'manager-type',
       title: '厨具类型',
       placeholder: '锅具',
       options: [{ value: '锅具', label: '锅具' }, { value: '电器', label: '电器' }, { value: '灶具', label: '灶具' }],
       value: '锅具',
       style: 'width:92px;height:44px;font-size:0.875rem;padding:0 10px'
     })}
     <button class="btn btn-primary btn-sm" data-action="manager-add">添加</button>`,
    async () => {
      const input = document.getElementById('manager-name');
      const name = input?.value?.trim();
      const type = document.getElementById('manager-type')?.value || '锅具';
      if (!name) { showFieldError(input, '请先填厨具名称'); return; }
      try {
        await addCookware(name, type);
      } catch (err) {
        showFieldError(input, err.message);
        return;
      }
      showToast('厨具已添加', { tone: 'success' });
      closeSheet();
      renderProfile();
    }
  );
}

async function showActionManager() {
  const list = await getActions();
  showManager(
    '动作管理',
    list.map(a => managerRowHtml({
      type: 'action',
      id: a.id,
      title: esc(a.name),
      params: a.params
    })).join(''),
    `<input class="input" id="manager-name" placeholder="动作名称" style="flex:1;height:44px">
     <button class="btn btn-primary btn-sm" data-action="manager-add">添加</button>`,
    async () => {
      const input = document.getElementById('manager-name');
      const name = input?.value?.trim();
      if (!name) { showFieldError(input, '请先填动作名称'); return; }
      try {
        await addAction(name);
      } catch (err) {
        showFieldError(input, err.message);
        return;
      }
      showToast('动作已添加', { tone: 'success' });
      closeSheet();
      renderProfile();
    }
  );
}

// ============================================
// 回收站
// ============================================
async function showTrash() {
  pushViewState({ view: 'trash' });
  showPage('page-trash');
  const items = await getTrashRecipes();
  let html = `
    <div class="detail-page">
      <div class="detail-topbar">
        <div class="detail-topbar-left">
          <button class="icon-btn" data-action="back" aria-label="返回">${SVG.back}</button>
          <span class="page-title">回收站</span>
        </div>
      </div>
  `;
  if (items.length === 0) {
    html += `<div class="empty-state"><div class="empty-state-icon">${SVG.trash}</div><div class="empty-state-text">回收站是空的</div></div>`;
  } else {
    html += `<div class="card">`;
    items.forEach(r => {
      html += `
        <div class="trash-item">
          ${tileHtml(r, 'sm')}
          <div class="trash-info">
            <div class="trash-name">${esc(r.name)}</div>
            <div class="trash-date">删除于 ${formatDate(r.deletedAt)}</div>
          </div>
          <button class="btn btn-secondary btn-sm" data-action="restore" data-id="${r.id}">恢复</button>
          <button class="icon-btn danger" data-action="purge" data-id="${r.id}" aria-label="永久删除">${SVG.trash}</button>
        </div>`;
    });
    html += `</div>`;
    html += `<button class="btn btn-secondary btn-block" style="margin-top:16px;color:var(--color-danger)" data-action="purge-all">清空回收站</button>`;
    html += `<div class="form-hint" style="margin-top:8px;text-align:center">清空后这些菜谱及它们的版本、做菜记录都无法恢复。</div>`;
  }
  html += `</div>`;
  $('page-trash').innerHTML = html;
}

// ============================================
// 历史版本
// ============================================
async function showVersions(recipeId) {
  pushViewState({ view: 'versions', id: recipeId });
  const recipe = await getRecipe(recipeId);
  const versions = await getVersions(recipeId); // 旧 → 新
  const currentId = versions[versions.length - 1]?.id;
  showPage('page-detail');

  let html = `
    <div class="detail-page">
      <div class="detail-topbar">
        <div class="detail-topbar-left">
          <button class="icon-btn" data-action="back-detail" data-id="${recipeId}" aria-label="返回菜谱详情">${SVG.back}</button>
          <span class="page-title">历史版本</span>
        </div>
      </div>
      <div class="version-timeline">
  `;
  // 列表按「新 → 旧」展示，当前版本排在最上面
  [...versions].reverse().forEach(v => {
    const isCurrent = v.id === currentId;
    html += `
      <button class="version-node${isCurrent ? ' current' : ''}" data-action="view-version" data-id="${v.id}">
        <span class="flex-between">
          <strong>${esc(recipe.name)}</strong>
          <span class="text-tertiary" style="font-size: 0.8125rem">${formatDateTime(v.createdAt)}</span>
        </span>
        <span class="text-secondary" style="display:block;font-size: 0.8125rem;margin-top:2px">${esc(v.note || (v.versionNumber === 1 ? '创建菜谱' : `第 ${v.versionNumber} 次修改`))}</span>
        ${isCurrent ? '<span class="tag" style="margin-top:6px">当前版本</span>' : ''}
      </button>`;
  });
  html += `</div></div>`;
  $('page-detail').innerHTML = html;
}

async function showVersionDetail(versionId) {
  pushViewState({ view: 'version', id: versionId });
  const version = await getVersion(versionId);
  if (!version) return;
  const versions = await getVersions(version.recipeId);
  const currentIdx = versions.findIndex(v => v.id === versionId);
  const prevVersion = currentIdx > 0 ? versions[currentIdx - 1] : null;
  const data = version.data || {};

  showPage('page-detail');
  let html = `
    <div class="detail-page">
      <div class="detail-topbar">
        <div class="detail-topbar-left">
          <button class="icon-btn" data-action="back-detail" data-id="${version.recipeId}" aria-label="返回菜谱详情">${SVG.back}</button>
        </div>
        <span class="tag">第 ${version.versionNumber} 版</span>
      </div>
      <h1 class="detail-hero-name" style="margin-bottom:6px">${esc(data.name || '')}</h1>
      <div class="text-secondary" style="font-size: 0.8125rem;margin-bottom:16px">保存于 ${formatDateTime(version.createdAt)}${version.note ? ` · ${esc(version.note)}` : ''}</div>
  `;

  if (prevVersion) {
    const prevData = prevVersion.data || {};
    html += sectionTitle('与上一版的差异');
    html += `<div class="diff-view" style="margin-bottom:16px">`;
    let diffCount = 0;
    if (prevData.name !== data.name) {
      diffCount++;
      html += `<div>菜名：<span class="diff-removed">${esc(prevData.name)}</span> → <span class="diff-added">${esc(data.name)}</span></div>`;
    }
    const prevIngs = (prevData.ingredients || []).map(i => `${i.name} ${i.amount}`).join('、');
    const curIngs = (data.ingredients || []).map(i => `${i.name} ${i.amount}`).join('、');
    if (prevIngs !== curIngs) {
      diffCount++;
      html += `<div>食材：<span class="diff-removed">${esc(prevIngs)}</span> → <span class="diff-added">${esc(curIngs)}</span></div>`;
    }
    const prevSteps = (prevData.steps || []).map(s => `${s.action}${s.heat ? `(${s.heat})` : ''}`).join(' → ');
    const curSteps = (data.steps || []).map(s => `${s.action}${s.heat ? `(${s.heat})` : ''}`).join(' → ');
    if (prevSteps !== curSteps) {
      diffCount++;
      html += `<div style="margin-top:8px">步骤：</div>`;
      html += `<div class="text-secondary" style="font-size: 0.8125rem">旧：${esc(prevSteps)}</div>`;
      html += `<div class="text-secondary" style="font-size: 0.8125rem">新：${esc(curSteps)}</div>`;
    }
    if (diffCount === 0) html += `<div class="text-secondary">仅备注或元数据变化</div>`;
    html += `</div>`;
  }

  if (data.ingredients?.length) {
    html += sectionTitle('食材');
    html += `<div class="card" style="margin-bottom:16px">`;
    data.ingredients.forEach(g => html += `<div class="ing-row"><span>${esc(g.name)}</span><span class="ing-amount">${esc(g.amount || '')}</span></div>`);
    html += `</div>`;
  }

  if (data.steps?.length) {
    html += sectionTitle('步骤');
    html += `<div class="card">`;
    data.steps.forEach((s, i) => {
      const params = stepDisplayParams(s).map(p => esc(s[p]));
      const ingTags = (s.ingredients || []).map(n => `<span class="ing">${esc(n)}</span>`).join('');
      html += `
        <div class="step-item">
          <span class="step-number">${i + 1}</span>
          <div class="step-detail">
            <div class="step-action">${esc(s.action || '')}</div>
            ${(params.length || s.cookware || ingTags) ? `<div class="step-params">${ingTags}${s.cookware ? `<span class="cw">${esc(s.cookware)}</span>` : ''}${params.map(p => `<span>${p}</span>`).join('')}</div>` : ''}
            ${s.note ? `<div class="step-note">${esc(s.note)}</div>` : ''}
          </div>
        </div>`;
    });
    html += `</div>`;
  }
  html += `
      <button class="btn btn-secondary btn-block" style="margin-top:20px" data-action="restore-version" data-id="${version.id}">
        恢复到这个版本
      </button>
    </div>`;
  $('page-detail').innerHTML = html;
}

async function restoreVersion(versionId) {
  const version = await getVersion(versionId);
  if (!version) return;
  const recipe = await getRecipe(version.recipeId);
  if (!recipe) return;
  const data = version.data || {};
  confirmSheet({
    title: `恢复到第 ${version.versionNumber} 版？`,
    message: '会用这一版的内容覆盖当前菜谱，并自动生成一条新的修改记录，照片保持不变。',
    confirmText: '恢复',
    onConfirm: async () => {
      try {
        await saveRecipeWithVersion(recipe.id, {
          name: data.name,
          description: data.description || '',
          categoryIds: data.categoryIds || [],
          serving: data.serving || recipe.serving,
          images: recipe.images || [],
          ingredients: data.ingredients || [],
          cookwares: data.cookwares || [],
          steps: data.steps || [],
          totalCookCount: recipe.totalCookCount,
          averageRating: recipe.averageRating
        }, `恢复到第 ${version.versionNumber} 版`);
        showToast(`已恢复到第 ${version.versionNumber} 版`, { tone: 'success' });
        showRecipeDetail(recipe.id);
      } catch (e) {
        showErrorSheet({
          title: '恢复没成功',
          message: e.message,
          hint: '菜谱内容没有被改动，可以再试一次。'
        });
      }
    }
  });
}
