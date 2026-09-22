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
      const name = document.getElementById('manager-name')?.value?.trim();
      if (!name) { showToast('请输入分类名称'); return; }
      await addCategory(name, '');
      showToast('分类已添加');
      closeSheet();
      renderProfile();
    }
  );
}

async function showCookwareManager() {
  const list = await getCookwares();
  showManager(
    '厨具管理',
    list.map(c => `
      <div class="flex-between" style="padding:12px 0;border-bottom:1px solid var(--color-line)">
        <span style="font-size: 1rem">${esc(c.name)} <span class="text-tertiary" style="font-size: 0.8125rem">(${esc(c.type)})</span></span>
        <div class="row-actions">
          <button class="icon-btn" style="width:32px;height:32px;border-radius:10px" data-action="manager-rename" data-id="${c.id}" data-type="cookware" aria-label="给这个厨具改名">${SVG.pencil}</button>
          <button class="icon-btn danger" style="width:32px;height:32px;border-radius:10px" data-action="manager-del" data-id="${c.id}" data-type="cookware" aria-label="删除这个厨具">${SVG.trash}</button>
        </div>
      </div>`).join(''),
    `<input class="input" id="manager-name" placeholder="厨具名称" style="flex:1;height:44px">
     <select class="select" id="manager-type" style="width:92px;height:44px;font-size: 0.875rem">
       <option>锅具</option><option>电器</option><option>灶具</option>
     </select>
     <button class="btn btn-primary btn-sm" data-action="manager-add">添加</button>`,
    async () => {
      const name = document.getElementById('manager-name')?.value?.trim();
      const type = document.getElementById('manager-type')?.value || '锅具';
      if (!name) { showToast('请输入厨具名称'); return; }
      await addCookware(name, type);
      showToast('厨具已添加');
      closeSheet();
      renderProfile();
    }
  );
}

async function showActionManager() {
  const list = await getActions();
  showManager(
    '动作管理',
    list.map(a => `
      <div class="flex-between" style="padding:12px 0;border-bottom:1px solid var(--color-line)">
        <span style="font-size: 1rem">${esc(a.name)}</span>
        <div class="row-actions">
          <button class="icon-btn" style="width:32px;height:32px;border-radius:10px" data-action="manager-rename" data-id="${a.id}" data-type="action" aria-label="给这个动作改名">${SVG.pencil}</button>
          <button class="icon-btn danger" style="width:32px;height:32px;border-radius:10px" data-action="manager-del" data-id="${a.id}" data-type="action" aria-label="删除这个动作">${SVG.trash}</button>
        </div>
      </div>`).join(''),
    `<input class="input" id="manager-name" placeholder="动作名称" style="flex:1;height:44px">
     <button class="btn btn-primary btn-sm" data-action="manager-add">添加</button>`,
    async () => {
      const name = document.getElementById('manager-name')?.value?.trim();
      if (!name) { showToast('请输入动作名称'); return; }
      await addAction(name);
      showToast('动作已添加');
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
  const versions = await getVersions(recipeId);
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
  versions.forEach(v => {
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
      const params = [];
      if (s.heat) params.push(esc(s.heat));
      if (s.duration) params.push(esc(s.duration));
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
        showToast('已恢复');
        showRecipeDetail(recipe.id);
      } catch (e) {
        showToast('恢复失败：' + e.message);
      }
    }
  });
}
