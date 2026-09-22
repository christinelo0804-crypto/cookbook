/* ============================================
   我家菜谱 - 数据库层
   基于 Dexie.js (IndexedDB)
   ============================================ */

const DB = new Dexie('MyFamilyCookbook');

DB.version(1).stores({
  recipes: '++id, name, category, createdAt, updatedAt',
  versions: '++id, recipeId, versionNumber, createdAt',
  cookRecords: '++id, recipeId, versionId, date',
  categories: '++id, name, sortOrder',
  cookwares: '++id, name, type, sortOrder'
});

// v2: 多分类 categoryIds、图片 images、软删除 deletedAt、动作表 actions
DB.version(2).stores({
  recipes: '++id, name, category, createdAt, updatedAt, deletedAt',
  versions: '++id, recipeId, versionNumber, createdAt',
  cookRecords: '++id, recipeId, versionId, date',
  categories: '++id, name, sortOrder',
  cookwares: '++id, name, type, sortOrder',
  actions: '++id, name, sortOrder'
}).upgrade(async tx => {
  await tx.table('recipes').toCollection().modify(r => {
    if (!r.categoryIds) {
      r.categoryIds = r.category ? [r.category] : [];
    }
    if (!r.images) r.images = [];
    if (!r.deletedAt) r.deletedAt = null;
    if (r.steps) {
      r.steps.forEach(s => {
        if (s.temperature === undefined) s.temperature = '';
      });
    }
  });
});

// 读取时自动把图片 ArrayBuffer 转成 Blob（UI 层无感知）
DB.recipes.hook('reading', recipe => decodeRecipeImages(recipe));

// ============================================
// 默认数据
// ============================================
const DEFAULT_CATEGORIES = [
  { name: '肉类', icon: '', sortOrder: 1 },
  { name: '水产', icon: '', sortOrder: 2 },
  { name: '素菜', icon: '', sortOrder: 3 },
  { name: '主食', icon: '', sortOrder: 4 },
  { name: '汤', icon: '', sortOrder: 5 },
  { name: '热菜', icon: '', sortOrder: 6 },
  { name: '凉菜', icon: '', sortOrder: 7 },
  { name: '甜品', icon: '', sortOrder: 8 }
];

// 旧版默认分类 → 新版默认分类（仅当分类保持默认、没被改过时才自动迁移）
const LEGACY_DEFAULT_CATEGORY_NAMES = ['热菜', '家常菜', '汤类', '主食', '凉菜', '水产', '甜品'];
const LEGACY_CATEGORY_RENAME = {
  '家常菜': '热菜',
  '汤类': '汤'
};

const DEFAULT_COOKWARES = [
  { name: '炒锅', type: '锅具', sortOrder: 1 },
  { name: '蒸锅', type: '锅具', sortOrder: 2 },
  { name: '煮锅', type: '锅具', sortOrder: 3 },
  { name: '汤锅', type: '锅具', sortOrder: 4 },
  { name: '平底锅', type: '锅具', sortOrder: 5 },
  { name: '空气炸锅', type: '电器', sortOrder: 6 },
  { name: '电饭煲', type: '电器', sortOrder: 7 },
  { name: '高压锅', type: '锅具', sortOrder: 8 },
  { name: '烤箱', type: '电器', sortOrder: 9 },
  { name: '微波炉', type: '电器', sortOrder: 10 },
  { name: '燃气灶', type: '灶具', sortOrder: 11 },
  { name: '电磁炉', type: '灶具', sortOrder: 12 }
];

const DEFAULT_HEAT_LEVELS = ['小火', '中小火', '中火', '中大火', '大火'];
const DEFAULT_ACTIONS = ['清洗', '切', '腌制', '焯水', '煎', '炸', '炒', '炖', '煮', '蒸', '烤', '调味', '收汁', '装盘'];

// ============================================
// 初始化数据库
// ============================================
async function initDB() {
  if (await DB.categories.count() === 0) {
    await DB.categories.bulkAdd(DEFAULT_CATEGORIES);
  }
  if (await DB.cookwares.count() === 0) {
    await DB.cookwares.bulkAdd(DEFAULT_COOKWARES);
  }
  if (await DB.actions.count() === 0) {
    await DB.actions.bulkAdd(DEFAULT_ACTIONS.map((name, i) => ({ name, sortOrder: i + 1 })));
  }
}

/**
 * 旧版默认分类 → 新版默认分类。
 * 只有当分类表正好是旧的一套默认值（说明用户没自定义过）时才自动替换，
 * 并把菜谱里引用的旧分类名同步改名，避免菜谱变成"未分类"。
 */
async function migrateLegacyDefaultCategories() {
  const categories = await DB.categories.toArray();
  if (categories.length !== LEGACY_DEFAULT_CATEGORY_NAMES.length) return -1;
  const names = categories.map(c => c.name).sort();
  const legacy = LEGACY_DEFAULT_CATEGORY_NAMES.slice().sort();
  if (names.join('|') !== legacy.join('|')) return -1;

  await DB.categories.clear();
  await DB.categories.bulkAdd(DEFAULT_CATEGORIES);

  const recipes = await DB.recipes.toArray();
  let updated = 0;
  for (const recipe of recipes) {
    const ids = recipe.categoryIds || [];
    if (!ids.length) continue;
    const mapped = [...new Set(ids.map(name => LEGACY_CATEGORY_RENAME[name] || name))];
    if (mapped.join('|') !== ids.join('|')) {
      await DB.recipes.update(recipe.id, { categoryIds: mapped });
      updated += 1;
    }
  }
  return updated;
}

// ============================================
// 菜谱 CRUD
// ============================================
async function createRecipe(data) {
  const now = new Date().toISOString();
  const recipe = await encodeRecipeImages({
    ...data,
    categoryIds: data.categoryIds || [],
    images: data.images || [],
    cookwares: data.cookwares || [],
    steps: data.steps || [],
    totalCookCount: 0,
    averageRating: 0,
    deletedAt: null,
    createdAt: now,
    updatedAt: now
  });
  const id = await DB.recipes.add(recipe);
  await DB.versions.add({
    recipeId: id,
    versionNumber: 1,
    data: JSON.parse(JSON.stringify({ ...recipe, images: [] })),
    note: '创建菜谱',
    createdAt: now
  });
  return id;
}

// 编辑保存：自动生成新版本（编辑 → 保存 即留档）
async function saveRecipeWithVersion(id, newData, note) {
  const versions = await DB.versions.where('recipeId').equals(id).toArray();
  const maxVer = versions.reduce((max, v) => Math.max(max, v.versionNumber), 0);
  const now = new Date().toISOString();
  const full = await encodeRecipeImages({
    ...newData,
    totalCookCount: newData.totalCookCount ?? 0,
    averageRating: newData.averageRating ?? 0,
    deletedAt: newData.deletedAt ?? null,
    updatedAt: now
  });
  await DB.versions.add({
    recipeId: id,
    versionNumber: maxVer + 1,
    data: JSON.parse(JSON.stringify({ ...full, images: [] })),
    note: note || '',
    createdAt: now
  });
  await DB.recipes.update(id, full);
  return maxVer + 1;
}

// 软删除 → 回收站
async function deleteRecipe(id) {
  await DB.recipes.update(id, { deletedAt: new Date().toISOString() });
}

async function restoreRecipe(id) {
  await DB.recipes.update(id, { deletedAt: null });
}

// 永久删除（回收站内操作）
async function purgeRecipe(id) {
  await DB.recipes.delete(id);
  await DB.versions.where('recipeId').equals(id).delete();
  await DB.cookRecords.where('recipeId').equals(id).delete();
}

async function getTrashRecipes() {
  const all = await DB.recipes.toArray();
  return all.filter(r => r.deletedAt).sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''));
}

/** 清空回收站：永久删除全部已删除菜谱及其版本、记录 */
async function purgeAllTrash() {
  const items = await getTrashRecipes();
  for (const recipe of items) {
    await purgeRecipe(recipe.id);
  }
  return items.length;
}

async function getRecipe(id) {
  return await DB.recipes.get(id);
}

async function getAllRecipes() {
  const all = await DB.recipes.orderBy('updatedAt').reverse().toArray();
  return all.filter(r => !r.deletedAt);
}

// ============================================
// 搜索（菜名 / 食材 / 分类 / 厨具 / 步骤）
// ============================================
async function searchRecipes(query) {
  const terms = String(query || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const all = await getAllRecipes();
  const hits = [];
  for (const recipe of all) {
    const name = String(recipe.name || '').toLowerCase();
    const text = [
      name,
      recipe.description || '',
      ...(recipe.categoryIds || []),
      ...(recipe.ingredients || []).map(i => i.name),
      ...(recipe.cookwares || []).map(c => c.name || c),
      ...(recipe.steps || []).map(s => `${s.action || ''} ${s.note || ''}`)
    ].join(' ').toLowerCase();
    if (terms.every(t => text.includes(t))) {
      hits.push({ recipe, rank: terms.some(t => name.includes(t)) ? 0 : 1 });
    }
  }
  hits.sort((a, b) => a.rank - b.rank);
  return hits.map(h => h.recipe);
}

// ============================================
// 版本管理
// ============================================
async function getVersions(recipeId) {
  return await DB.versions
    .where('recipeId').equals(recipeId)
    .reverse()
    .sortBy('versionNumber');
}

async function getVersion(id) {
  return await DB.versions.get(id);
}

// ============================================
// 做菜记录
// ============================================
async function refreshRecipeStats(recipeId) {
  const recipe = await DB.recipes.get(recipeId);
  const records = await DB.cookRecords.where('recipeId').equals(recipeId).toArray();
  const totalCount = records.length;
  // 导入来的菜谱可能只有累计次数、没有对应记录，这部分要保留，不能被记录条数覆盖
  const base = (recipe && recipe.importedCookCount) || 0;
  const rated = records.filter(r => (r.rating || 0) > 0);
  const update = { totalCookCount: base + totalCount };
  if (rated.length) {
    update.averageRating = Math.round(rated.reduce((s, r) => s + r.rating, 0) / rated.length * 10) / 10;
  } else if (!recipe || !recipe.averageRating) {
    update.averageRating = 0;
  }
  // 没有评分记录时保留原有平均分，避免导入的历史评分被清零
  await DB.recipes.update(recipeId, update);
}

async function createCookRecord(data) {
  const id = await DB.cookRecords.add({
    ...data,
    results: data.results || [],
    createdAt: new Date().toISOString()
  });
  await refreshRecipeStats(data.recipeId);
  return id;
}

async function deleteCookRecord(id) {
  const record = await DB.cookRecords.get(id);
  await DB.cookRecords.delete(id);
  if (record) await refreshRecipeStats(record.recipeId);
}

async function getCookRecord(id) {
  return await DB.cookRecords.get(id);
}

async function updateCookRecord(id, data) {
  const before = await DB.cookRecords.get(id);
  await DB.cookRecords.update(id, data);
  const after = await DB.cookRecords.get(id);
  if (before && before.recipeId !== (after && after.recipeId)) {
    await refreshRecipeStats(before.recipeId);
  }
  if (after) await refreshRecipeStats(after.recipeId);
}

async function getCookRecords(recipeId) {
  return await DB.cookRecords
    .where('recipeId').equals(recipeId)
    .reverse()
    .sortBy('date');
}

async function getAllCookRecords() {
  return await DB.cookRecords
    .orderBy('date')
    .reverse()
    .toArray();
}

// ============================================
// 统计
// ============================================
async function getHomeStats() {
  const recipes = await getAllRecipes();
  const records = await getAllCookRecords();
  const now = new Date();
  const monthCount = records.filter(r => {
    const d = new Date(r.date);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
  const avgRating = averageRatingOf(recipes, records);
  const frequent = [...recipes].sort((a, b) => (b.totalCookCount || 0) - (a.totalCookCount || 0)).filter(r => r.totalCookCount > 0).slice(0, 5);
  const topRated = [...recipes].filter(r => (r.averageRating || 0) > 0).sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0)).slice(0, 5);
  const topRating = topRated.length ? topRated[0].averageRating : 0;
  return { recipeCount: recipes.length, monthCount, avgRating, topRating, frequent, topRated };
}

/**
 * 平均评分口径：先按「每次做菜记录」平均（没打分的记录不参与）；
 * 如果一条记录都没有，再退化为「打过分的菜谱」的平均分。
 * 以前是把没打过分的菜谱按 0 分一起平均，结果会偏低。
 */
function averageRatingOf(recipes, records) {
  const rated = (records || []).filter(r => (r.rating || 0) > 0);
  if (rated.length) {
    return Math.round(rated.reduce((s, r) => s + r.rating, 0) / rated.length * 10) / 10;
  }
  const ratedRecipes = (recipes || []).filter(r => (r.averageRating || 0) > 0);
  if (!ratedRecipes.length) return 0;
  return Math.round(ratedRecipes.reduce((s, r) => s + r.averageRating, 0) / ratedRecipes.length * 10) / 10;
}

function daysBetween(fromIso, toDate) {
  const from = new Date(fromIso);
  if (isNaN(from.getTime())) return null;
  return Math.max(0, Math.floor((toDate - from) / 86400000));
}

/** 统计页所需的全部数据 */
async function getStatsSummary() {
  const recipes = await getAllRecipes();
  const records = await getAllCookRecords();
  const allVersions = await DB.versions.toArray();
  const now = new Date();

  // 修改次数：统计当前菜谱中"第 2 版及以后"的版本数量。
  // 不能再用「版本总数 − 菜谱数」，那样会把回收站里菜谱的版本也算进来（它们已不在菜谱列表中）。
  const visibleRecipeIds = new Set(recipes.map(r => r.id));
  const editCount = allVersions.filter(v => visibleRecipeIds.has(v.recipeId) && (v.versionNumber || 1) > 1).length;

  // 概览
  const recipeNameById = new Map(recipes.map(r => [r.id, r.name]));
  const lastRecord = records[0] || null;
  const avgRating = averageRatingOf(recipes, records);
  const ratedRecords = records.filter(r => (r.rating || 0) > 0);

  // 近 6 个月趋势
  const monthly = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const count = records.filter(r => {
      const rd = new Date(r.date);
      return rd.getFullYear() === d.getFullYear() && rd.getMonth() === d.getMonth();
    }).length;
    monthly.push({ year: d.getFullYear(), month: d.getMonth() + 1, count, isCurrent: i === 0 });
  }

  // 最常做 Top 5（按记录条数，累计次数兜底）
  const countByRecipe = new Map();
  for (const r of records) {
    countByRecipe.set(r.recipeId, (countByRecipe.get(r.recipeId) || 0) + 1);
  }
  const topFrequent = recipes
    .map(recipe => ({
      recipe,
      times: Math.max(countByRecipe.get(recipe.id) || 0, recipe.totalCookCount || 0)
    }))
    .filter(item => item.times > 0)
    .sort((a, b) => b.times - a.times)
    .slice(0, 5);

  // 评分分布
  const ratingDist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0, unrated: 0 };
  for (const r of records) {
    const rating = Number(r.rating) || 0;
    if (rating <= 0) {
      ratingDist.unrated += 1;
      continue;
    }
    // 按半星归类：4.5~5.0 计入 5 星，3.5~4.4 计入 4 星，依此类推
    const bucket = Math.min(5, Math.max(1, Math.floor(rating + 0.5)));
    ratingDist[bucket] += 1;
  }

  // 做菜结果标签
  const tagCount = new Map();
  for (const r of records) {
    for (const tag of r.results || []) {
      tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
    }
  }
  const resultTags = [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

  // 分类分布（一道菜可属多个分类）
  const categoryCount = new Map();
  let uncategorized = 0;
  for (const recipe of recipes) {
    const ids = recipe.categoryIds || [];
    if (!ids.length) { uncategorized += 1; continue; }
    for (const name of ids) categoryCount.set(name, (categoryCount.get(name) || 0) + 1);
  }
  const categoryDist = [...categoryCount.entries()].sort((a, b) => b[1] - a[1]);
  if (uncategorized) categoryDist.push(['未分类', uncategorized]);

  // 频率与其他
  const dates = records.map(r => new Date(r.date)).filter(d => !isNaN(d.getTime())).sort((a, b) => a - b);
  const firstDate = dates[0] || null;
  const weeks = firstDate ? Math.max(1, (now - firstDate) / (7 * 86400000)) : 0;
  const avgPerWeek = weeks ? Math.round(records.length / weeks * 10) / 10 : 0;

  const lastByRecipe = new Map();
  for (const r of records) {
    const day = new Date(r.date);
    if (isNaN(day.getTime())) continue;
    const prev = lastByRecipe.get(r.recipeId);
    if (!prev || day > prev) lastByRecipe.set(r.recipeId, day);
  }
  let longestNotCooked = null;
  for (const [recipeId, day] of lastByRecipe.entries()) {
    const days = Math.max(0, Math.floor((now - day) / 86400000));
    if (!longestNotCooked || days > longestNotCooked.days) {
      longestNotCooked = { name: recipeNameById.get(recipeId) || '已删除的菜谱', days };
    }
  }
  const neverCooked = recipes.filter(r => !(r.totalCookCount > 0) && !countByRecipe.has(r.id)).length;

  return {
    recipeCount: recipes.length,
    recordCount: records.length,
    avgRating,
    avgRatingSample: ratedRecords.length || recipes.filter(r => (r.averageRating || 0) > 0).length,
    lastCookDays: lastRecord ? daysBetween(lastRecord.date, now) : null,
    monthly,
    topFrequent,
    ratingDist,
    resultTags,
    categoryDist,
    avgPerWeek,
    longestNotCooked,
    neverCooked,
    editCount
  };
}

// ============================================
// 分类 / 厨具 / 动作 管理
// ============================================
async function getCategories() {
  return await DB.categories.orderBy('sortOrder').toArray();
}

async function addCategory(name, icon) {
  const cats = await DB.categories.toArray();
  return await DB.categories.add({ name, icon: icon || '', sortOrder: cats.length + 1 });
}

async function deleteCategory(id) {
  const cat = await DB.categories.get(id);
  if (!cat) return;
  const all = await getAllRecipes();
  const used = all.filter(r => (r.categoryIds || []).includes(cat.name));
  if (used.length > 0) throw new Error(`分类「${cat.name}」正在被 ${used.length} 道菜使用`);
  await DB.categories.delete(id);
}

/** 分类改名：同时更新所有引用该分类的菜谱 */
async function renameCategory(id, newName) {
  const cat = await DB.categories.get(id);
  if (!cat) return;
  const name = String(newName || '').trim();
  if (!name) throw new Error('分类名称不能为空');
  if (name === cat.name) return;
  const duplicate = await DB.categories.where('name').equals(name).first();
  if (duplicate) throw new Error(`已经有叫「${name}」的分类了`);
  await DB.categories.update(id, { name });
  const all = await getAllRecipes();
  for (const recipe of all) {
    if ((recipe.categoryIds || []).includes(cat.name)) {
      const categoryIds = recipe.categoryIds.map(c => (c === cat.name ? name : c));
      await DB.recipes.update(recipe.id, { categoryIds, updatedAt: new Date().toISOString() });
    }
  }
}

async function getCookwares() {
  return await DB.cookwares.orderBy('sortOrder').toArray();
}

async function addCookware(name, type) {
  const list = await DB.cookwares.toArray();
  return await DB.cookwares.add({ name, type: type || '锅具', sortOrder: list.length + 1 });
}

async function deleteCookware(id) {
  const cw = await DB.cookwares.get(id);
  if (!cw) return;
  const all = await getAllRecipes();
  const used = all.filter(r => (r.cookwares || []).some(c => (c.name || c) === cw.name));
  if (used.length > 0) throw new Error(`厨具「${cw.name}」正在被 ${used.length} 道菜使用`);
  await DB.cookwares.delete(id);
}

/** 厨具改名：同时更新所有引用该厨具的菜谱 */
async function renameCookware(id, newName) {
  const cw = await DB.cookwares.get(id);
  if (!cw) return;
  const name = String(newName || '').trim();
  if (!name) throw new Error('厨具名称不能为空');
  if (name === cw.name) return;
  const duplicate = await DB.cookwares.where('name').equals(name).first();
  if (duplicate) throw new Error(`已经有叫「${name}」的厨具了`);
  await DB.cookwares.update(id, { name });
  const all = await getAllRecipes();
  for (const recipe of all) {
    const list = recipe.cookwares || [];
    if (list.some(c => (c.name || c) === cw.name)) {
      const cookwares = list.map(c => ((c.name || c) === cw.name ? { ...(typeof c === 'string' ? {} : c), name } : c));
      await DB.recipes.update(recipe.id, { cookwares, updatedAt: new Date().toISOString() });
    }
  }
}

async function getActions() {
  return await DB.actions.orderBy('sortOrder').toArray();
}

async function addAction(name) {
  const list = await DB.actions.toArray();
  return await DB.actions.add({ name, sortOrder: list.length + 1 });
}

async function deleteAction(id) {
  const action = await DB.actions.get(id);
  if (!action) return;
  const all = await getAllRecipes();
  const used = all.filter(r => (r.steps || []).some(s => s.action === action.name));
  if (used.length > 0) throw new Error(`动作「${action.name}」正在被 ${used.length} 道菜使用`);
  await DB.actions.delete(id);
}

/** 动作改名：同时更新所有使用该动作的步骤 */
async function renameAction(id, newName) {
  const action = await DB.actions.get(id);
  if (!action) return;
  const name = String(newName || '').trim();
  if (!name) throw new Error('动作名称不能为空');
  if (name === action.name) return;
  const duplicate = await DB.actions.where('name').equals(name).first();
  if (duplicate) throw new Error(`已经有叫「${name}」的动作了`);
  await DB.actions.update(id, { name });
  const all = await getAllRecipes();
  for (const recipe of all) {
    const steps = recipe.steps || [];
    if (steps.some(s => s.action === action.name)) {
      const updatedSteps = steps.map(s => (s.action === action.name ? { ...s, action: name } : s));
      await DB.recipes.update(recipe.id, { steps: updatedSteps, updatedAt: new Date().toISOString() });
    }
  }
}

/** 复制菜谱：内容全部复制，图片各自独立编号 */
async function duplicateRecipe(id) {
  const recipe = await getRecipe(id);
  if (!recipe) throw new Error('菜谱不存在');
  const images = [];
  for (const img of recipe.images || []) {
    const encoded = await encodeImageAsset(img);
    if (encoded) images.push({ ...encoded, id: newImageId() });
  }
  const { id: _omit, createdAt: _created, updatedAt: _updated, totalCookCount, averageRating, importedCookCount: _imported, ...rest } = recipe;
  return await createRecipe({
    ...rest,
    name: `${recipe.name} 副本`,
    images,
    totalCookCount: 0,
    averageRating: 0,
    importedCookCount: 0
  });
}
