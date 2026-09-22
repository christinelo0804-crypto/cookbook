/* ============================================
   我家菜谱 - 备份档案（.cookbook）

   结构（参考 ShowArchive 的 .showarchive 方案）：
     manifest.json          格式版本、应用名、导出时间、数量统计
     data/recipes.json      按实体分文件
     data/versions.json
     data/cookRecords.json
     data/categories.json
     data/cookwares.json
     data/actions.json
     data/settings.json
     media/<菜谱id>/<图片id>-display.jpg   图片以二进制进包
     media/<菜谱id>/<图片id>-thumb.jpg
   ============================================ */

const ARCHIVE_FORMAT_VERSION = 1;
const ARCHIVE_APP = '我家菜谱';

function archiveToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function archiveFilename() {
  return `我家菜谱-${archiveToday()}.cookbook`;
}

function extOf(contentType) {
  return contentType === 'image/png' ? 'png' : 'jpg';
}

function readArchiveSettings() {
  return {
    fontSize: localStorage.getItem('my-recipes-font-size') || '标准',
    backupRemind: localStorage.getItem('my-recipes-backup-remind') || 'on',
    lastExport: localStorage.getItem('my-recipes-last-export') || '',
    lastExportAt: localStorage.getItem('my-recipes-last-export-at') || ''
  };
}

function applyArchiveSettings(settings) {
  if (!settings || typeof settings !== 'object') return;
  if (settings.fontSize) localStorage.setItem('my-recipes-font-size', settings.fontSize);
  if (settings.backupRemind) localStorage.setItem('my-recipes-backup-remind', settings.backupRemind);
  if (settings.lastExport) localStorage.setItem('my-recipes-last-export', settings.lastExport);
  if (settings.lastExportAt) localStorage.setItem('my-recipes-last-export-at', settings.lastExportAt);
}

// ============================================
// 导出
// ============================================
async function collectImageRef(img, recipeId, index, media) {
  if (!img) return null;
  if (typeof img === 'string') {
    // 老数据（dataURL）在迁移中已转换；若仍存在则跳过，避免把巨型字符串塞进 JSON
    return null;
  }
  const id = img.id || `img-${recipeId}-${index}`;
  const contentType = img.contentType || 'image/jpeg';
  const ext = extOf(contentType);
  const base = `media/${recipeId}/${id}`;
  const thumbPath = `${base}-thumb.${ext}`;
  const displayPath = `${base}-display.${ext}`;
  const [thumbBuffer, displayBuffer] = await Promise.all([
    toBuffer(img.thumbnail),
    toBuffer(img.display)
  ]);
  if (thumbBuffer) media.push({ path: thumbPath, blob: new Blob([thumbBuffer], { type: contentType }) });
  if (displayBuffer) media.push({ path: displayPath, blob: new Blob([displayBuffer], { type: contentType }) });
  return {
    id,
    contentType,
    width: img.width,
    height: img.height,
    thumbPath: thumbBuffer ? thumbPath : undefined,
    displayPath: displayBuffer ? displayPath : undefined
  };
}

/** 收集全库数据 + 图片，供打包使用 */
async function gatherArchiveData() {
  const [recipes, versions, cookRecords, categories, cookwares, actions] = await Promise.all([
    DB.recipes.toArray(),
    DB.versions.toArray(),
    DB.cookRecords.toArray(),
    DB.categories.toArray(),
    DB.cookwares.toArray(),
    DB.actions.toArray()
  ]);

  const media = [];
  const exportedRecipes = [];
  for (const recipe of recipes) {
    const images = [];
    const list = recipe.images || [];
    for (let i = 0; i < list.length; i += 1) {
      const ref = await collectImageRef(list[i], recipe.id, i + 1, media);
      if (ref) images.push(ref);
    }
    exportedRecipes.push({ ...recipe, images });
  }

  // 历史版本快照不含图片，避免备份体积成倍增长
  const exportedVersions = versions.map(v => ({
    ...v,
    data: v.data ? { ...v.data, images: [] } : v.data
  }));

  return {
    data: {
      recipes: exportedRecipes,
      versions: exportedVersions,
      cookRecords,
      categories,
      cookwares,
      actions,
      settings: readArchiveSettings()
    },
    media
  };
}

async function buildArchiveBlob(result) {
  const zip = new JSZip();
  const manifest = {
    formatVersion: ARCHIVE_FORMAT_VERSION,
    app: ARCHIVE_APP,
    exportedAt: new Date().toISOString(),
    counts: {
      recipes: result.data.recipes.length,
      records: result.data.cookRecords.length,
      media: result.media.length
    }
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('data/recipes.json', JSON.stringify(result.data.recipes, null, 2));
  zip.file('data/versions.json', JSON.stringify(result.data.versions, null, 2));
  zip.file('data/cookRecords.json', JSON.stringify(result.data.cookRecords, null, 2));
  zip.file('data/categories.json', JSON.stringify(result.data.categories, null, 2));
  zip.file('data/cookwares.json', JSON.stringify(result.data.cookwares, null, 2));
  zip.file('data/actions.json', JSON.stringify(result.data.actions, null, 2));
  zip.file('data/settings.json', JSON.stringify(result.data.settings || {}, null, 2));
  for (const entry of result.media) zip.file(entry.path, entry.blob);
  return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function formatFileSize(bytes) {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** 一键导出：打包 → 下载 → 记录备份时间 */
async function exportArchive() {
  const result = await gatherArchiveData();
  const blob = await buildArchiveBlob(result);
  downloadBlob(blob, archiveFilename());
  localStorage.setItem('my-recipes-last-export', `上次 ${archiveToday()}`);
  localStorage.setItem('my-recipes-last-export-at', new Date().toISOString());
  return {
    recipes: result.data.recipes.length,
    records: result.data.cookRecords.length,
    media: result.media.length,
    size: blob.size
  };
}

// ============================================
// 导入：解析
// ============================================
async function parseArchiveFile(file) {
  if (file.size === 0) {
    throw new Error(`所选文件「${file.name}」是空文件，请确认档案已完整下载到本机`);
  }

  let zip;
  try {
    // 先转 ArrayBuffer 再解压，兼容 iOS 上 Service Worker 控制时直接读磁盘文件的已知问题
    const buffer = await file.arrayBuffer();
    if (buffer.byteLength === 0) throw new Error('empty');
    zip = await JSZip.loadAsync(buffer);
  } catch (e) {
    // 兼容旧版 JSON 备份
    const legacy = await tryParseLegacyJson(file);
    if (legacy) return { legacy: true, json: legacy };
    throw new Error(`无法读取「${file.name}」，请确认选择的是 .cookbook 备份文件`);
  }

  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) throw new Error('这不是有效的我家菜谱备份（缺少 manifest.json）');

  let manifest;
  try {
    manifest = JSON.parse(await manifestFile.async('text'));
  } catch (e) {
    throw new Error('备份清单损坏，无法读取');
  }
  if (manifest.formatVersion == null) throw new Error('备份缺少格式版本号');
  if (manifest.formatVersion > ARCHIVE_FORMAT_VERSION) {
    throw new Error(`这份备份由更新版本创建（v${manifest.formatVersion}），请先更新应用再导入`);
  }

  const readJson = async (path, fallback) => {
    const entry = zip.file(path);
    if (!entry) return fallback;
    try {
      return JSON.parse(await entry.async('text'));
    } catch (e) {
      throw new Error(`备份中的 ${path} 损坏，无法读取`);
    }
  };

  const data = {
    recipes: await readJson('data/recipes.json', []),
    versions: await readJson('data/versions.json', []),
    cookRecords: await readJson('data/cookRecords.json', []),
    categories: await readJson('data/categories.json', []),
    cookwares: await readJson('data/cookwares.json', []),
    actions: await readJson('data/actions.json', []),
    settings: await readJson('data/settings.json', {})
  };
  return { legacy: false, manifest, data, zip };
}

async function tryParseLegacyJson(file) {
  try {
    const text = await file.text();
    const json = JSON.parse(text);
    if (json && json.data) return json;
    return null;
  } catch (e) {
    return null;
  }
}

async function readMediaAsset(zip, ref) {
  if (!ref) return undefined;
  const read = async (path) => {
    if (!path) return undefined;
    const entry = zip.file(path);
    return entry ? await entry.async('arraybuffer') : undefined;
  };
  const [thumbnail, display] = await Promise.all([read(ref.thumbPath), read(ref.displayPath)]);
  if (!thumbnail && !display) return undefined;
  return {
    id: ref.id || newImageId(),
    thumbnail,
    display,
    contentType: ref.contentType || 'image/jpeg',
    width: ref.width,
    height: ref.height
  };
}

async function exportedRecipeToStored(parsed, recipe, recordCountByRecipeId) {
  const images = [];
  for (const ref of recipe.images || []) {
    const asset = await readMediaAsset(parsed.zip, ref);
    if (asset) images.push(asset);
  }
  // 保留"有累计次数但没有对应记录"的部分，避免之后新增记录时把总次数覆盖掉
  const recordCount = (recordCountByRecipeId && recordCountByRecipeId.get(recipe.id)) || 0;
  const importedCookCount = Math.max(0, (recipe.totalCookCount || 0) - recordCount);
  return { ...recipe, images, importedCookCount };
}

/** 统计每个菜谱在备份里的记录条数 */
function countRecordsByRecipe(records) {
  const map = new Map();
  for (const record of records || []) {
    map.set(record.recipeId, (map.get(record.recipeId) || 0) + 1);
  }
  return map;
}

function recipeKey(recipe) {
  return String(recipe.name || '').trim().toLowerCase();
}

/** 内容指纹：菜名相同但内容不同时，导入会另存为副本，而不是被当成重复跳过 */
function recipeSignature(recipe) {
  return [
    recipeKey(recipe),
    String(recipe.serving || ''),
    (recipe.ingredients || []).map(i => `${i.name} ${i.amount || ''}`).join('/'),
    (recipe.steps || []).map(s => `${s.action} ${s.heat || ''} ${s.duration || ''}`).join('/')
  ].join('|');
}

function recordKey(recipeName, date) {
  return `${String(recipeName || '').trim().toLowerCase()}|${date || ''}`;
}

/** 导入前预览：会新增多少、重复多少 */
async function previewArchiveMerge(data) {
  const [recipes, records] = await Promise.all([DB.recipes.toArray(), DB.cookRecords.toArray()]);
  const existingSignatures = new Map();
  for (const recipe of recipes) {
    const key = recipeKey(recipe);
    if (!existingSignatures.has(key)) existingSignatures.set(key, new Set());
    existingSignatures.get(key).add(recipeSignature(recipe));
  }
  const recipeNameById = new Map(recipes.map(r => [r.id, r.name]));
  const existingRecordKeys = new Set(
    records.map(r => recordKey(recipeNameById.get(r.recipeId), r.date))
  );

  let newRecipes = 0;
  let duplicateRecipes = 0;
  let renamedRecipes = 0;
  const importedNameById = new Map((data.recipes || []).map(r => [r.id, r.name]));
  for (const recipe of data.recipes || []) {
    const key = recipeKey(recipe);
    const sig = recipeSignature(recipe);
    const bucket = existingSignatures.get(key);
    if (bucket && bucket.has(sig)) {
      duplicateRecipes += 1;      // 同名同内容 → 跳过
    } else {
      if (bucket) renamedRecipes += 1;  // 同名不同内容 → 另存副本
      else newRecipes += 1;
      if (!existingSignatures.has(key)) existingSignatures.set(key, new Set());
      existingSignatures.get(key).add(sig);
    }
  }

  const seenRecords = new Set();
  let newRecords = 0;
  let duplicateRecords = 0;
  for (const record of data.cookRecords || []) {
    const key = recordKey(importedNameById.get(record.recipeId), record.date);
    if (existingRecordKeys.has(key) || seenRecords.has(key)) {
      duplicateRecords += 1;
      continue;
    }
    seenRecords.add(key);
    newRecords += 1;
  }

  return {
    newRecipes,
    duplicateRecipes,
    renamedRecipes,
    newRecords,
    duplicateRecords,
    totalRecipes: (data.recipes || []).length,
    totalRecords: (data.cookRecords || []).length,
    totalMedia: (data.recipes || []).reduce((sum, r) => sum + (r.images || []).length, 0)
  };
}

// ============================================
// 导入：替换 / 合并
// ============================================
async function importArchiveReplace(parsed) {
  const prepared = [];
  const recordCountByRecipeId = countRecordsByRecipe(parsed.data.cookRecords);
  for (const recipe of parsed.data.recipes) {
    prepared.push(await exportedRecipeToStored(parsed, recipe, recordCountByRecipeId));
  }

  await DB.transaction('rw', [DB.recipes, DB.versions, DB.cookRecords, DB.categories, DB.cookwares, DB.actions], async () => {
    await Promise.all([
      DB.recipes.clear(),
      DB.versions.clear(),
      DB.cookRecords.clear(),
      DB.categories.clear(),
      DB.cookwares.clear(),
      DB.actions.clear()
    ]);
    if (parsed.data.categories.length) await DB.categories.bulkAdd(parsed.data.categories);
    if (parsed.data.cookwares.length) await DB.cookwares.bulkAdd(parsed.data.cookwares);
    if (parsed.data.actions.length) await DB.actions.bulkAdd(parsed.data.actions);
    if (prepared.length) await DB.recipes.bulkAdd(prepared);
    if (parsed.data.versions.length) await DB.versions.bulkAdd(parsed.data.versions);
    if (parsed.data.cookRecords.length) await DB.cookRecords.bulkAdd(parsed.data.cookRecords);
  });

  await initDB();
  applyArchiveSettings(parsed.data.settings);
  return { recipes: prepared.length, records: parsed.data.cookRecords.length };
}

async function importArchiveMerge(parsed) {
  const prepared = [];
  const recordCountByRecipeId = countRecordsByRecipe(parsed.data.cookRecords);
  for (const recipe of parsed.data.recipes) {
    prepared.push(await exportedRecipeToStored(parsed, recipe, recordCountByRecipeId));
  }

  let addedRecipes = 0;
  let skippedRecipes = 0;
  let renamedRecipes = 0;
  let addedRecords = 0;
  let skippedRecords = 0;

  await DB.transaction('rw', [DB.recipes, DB.versions, DB.cookRecords, DB.categories, DB.cookwares, DB.actions], async () => {
    // 基础数据按名称合并
    const mergeByName = async (table, items) => {
      const existing = await table.toArray();
      const names = new Set(existing.map(i => String(i.name || '').trim().toLowerCase()));
      const added = [];
      for (const item of items || []) {
        const key = String(item.name || '').trim().toLowerCase();
        if (!key || names.has(key)) continue;
        names.add(key);
        added.push({
          name: item.name,
          icon: item.icon || '',
          type: item.type,
          sortOrder: item.sortOrder
        });
      }
      if (added.length) await table.bulkAdd(added);
    };
    await mergeByName(DB.categories, parsed.data.categories);
    await mergeByName(DB.cookwares, parsed.data.cookwares);
    await mergeByName(DB.actions, parsed.data.actions);

    // 菜谱：同名同内容视为重复跳过；同名但内容不同则另存为副本
    const existingRecipes = await DB.recipes.toArray();
    const signaturesByName = new Map();
    const usedNames = new Set();
    for (const recipe of existingRecipes) {
      const key = recipeKey(recipe);
      usedNames.add(key);
      if (!signaturesByName.has(key)) signaturesByName.set(key, new Set());
      signaturesByName.get(key).add(recipeSignature(recipe));
    }
    const nameById = new Map(existingRecipes.map(r => [r.id, r.name]));
    const idMap = new Map();
    const versionIdMap = new Map();

    for (const recipe of prepared) {
      const key = recipeKey(recipe);
      const sig = recipeSignature(recipe);
      const bucket = signaturesByName.get(key);
      let finalName = recipe.name;
      if (bucket && bucket.has(sig)) {
        skippedRecipes += 1;
        continue;
      }
      if (bucket) {
        // 重名但内容不同 → 起一个不冲突的名字
        let n = 2;
        while (usedNames.has(String(`${recipe.name}（${n}）`).trim().toLowerCase())) n += 1;
        finalName = `${recipe.name}（${n}）`;
        renamedRecipes += 1;
      }
      const finalKey = String(finalName).trim().toLowerCase();
      usedNames.add(finalKey);
      if (!signaturesByName.has(finalKey)) signaturesByName.set(finalKey, new Set());
      signaturesByName.get(finalKey).add(sig);
      const { id, ...rest } = recipe;
      const newId = await DB.recipes.add({ ...rest, name: finalName, updatedAt: new Date().toISOString() });
      idMap.set(id, newId);
      nameById.set(newId, finalName);
      addedRecipes += 1;
    }

    // 版本跟随菜谱映射
    for (const version of parsed.data.versions || []) {
      const newRecipeId = idMap.get(version.recipeId);
      if (!newRecipeId) continue;
      const { id, ...rest } = version;
      const newVersionId = await DB.versions.add({ ...rest, recipeId: newRecipeId });
      versionIdMap.set(id, newVersionId);
    }

    // 做菜记录按「菜名 + 日期」去重
    const existingRecords = await DB.cookRecords.toArray();
    const existingRecordKeys = new Set(
      existingRecords.map(r => recordKey(nameById.get(r.recipeId), r.date))
    );
    for (const record of parsed.data.cookRecords || []) {
      const newRecipeId = idMap.get(record.recipeId);
      if (!newRecipeId) {
        skippedRecords += 1;
        continue;
      }
      const key = recordKey(nameById.get(newRecipeId), record.date);
      if (existingRecordKeys.has(key)) {
        skippedRecords += 1;
        continue;
      }
      existingRecordKeys.add(key);
      const { id, ...rest } = record;
      await DB.cookRecords.add({
        ...rest,
        recipeId: newRecipeId,
        versionId: versionIdMap.get(record.versionId) || null
      });
      addedRecords += 1;
    }
  });

  await initDB();
  return { addedRecipes, skippedRecipes, renamedRecipes, addedRecords, skippedRecords };
}

/** 兼容旧版 JSON 备份：整体替换导入 */
async function importLegacyJson(json) {
  const data = json.data || {};
  const recipes = [];
  for (const recipe of data.recipes || []) {
    recipes.push({
      ...recipe,
      categoryIds: recipe.categoryIds || (recipe.category ? [recipe.category] : []),
      images: recipe.images || [],
      deletedAt: recipe.deletedAt === undefined ? null : recipe.deletedAt
    });
  }
  await DB.transaction('rw', [DB.recipes, DB.versions, DB.cookRecords, DB.categories, DB.cookwares, DB.actions], async () => {
    await Promise.all([
      DB.recipes.clear(),
      DB.versions.clear(),
      DB.cookRecords.clear(),
      DB.categories.clear(),
      DB.cookwares.clear(),
      DB.actions.clear()
    ]);
    if (data.categories) await DB.categories.bulkAdd(data.categories);
    if (data.cookwares) await DB.cookwares.bulkAdd(data.cookwares);
    if (data.actions) await DB.actions.bulkAdd(data.actions);
    if (recipes.length) await DB.recipes.bulkAdd(recipes);
    if (data.versions) await DB.versions.bulkAdd(data.versions);
    if (data.records) await DB.cookRecords.bulkAdd(data.records);
  });
  await initDB();
  return { recipes: recipes.length };
}
