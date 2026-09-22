/* ============================================
   我家菜谱 - 图片处理与存储编解码

   存储层：ArrayBuffer（iOS Safari 的 IndexedDB 存 Blob 不可靠）
   内存层：Blob（渲染时用）
   两个尺寸：display 最大 1280px，thumbnail 最大 320px
   ============================================ */

const IMAGE_DISPLAY_MAX = 1280;
const IMAGE_THUMB_MAX = 320;
const IMAGE_DISPLAY_QUALITY = 0.8;
const IMAGE_THUMB_QUALITY = 0.7;

let imageSeq = 0;

function newImageId() {
  imageSeq += 1;
  return `img-${Date.now().toString(36)}-${imageSeq}`;
}

function isLegacyImage(img) {
  return typeof img === 'string';
}

/** ArrayBuffer → Blob（已经是 Blob 就原样返回） */
function toBlob(value, contentType) {
  if (!value) return undefined;
  if (value instanceof Blob) return value;
  return new Blob([value], { type: contentType || 'image/jpeg' });
}

/** Blob → ArrayBuffer（已经是 ArrayBuffer 就原样返回） */
async function toBuffer(value) {
  if (!value) return undefined;
  if (value instanceof Blob) return await value.arrayBuffer();
  return value;
}

/** 读取用：存储格式 → 内存格式（Blob） */
function decodeImageAsset(img) {
  if (!img) return undefined;
  if (isLegacyImage(img)) return img; // 老数据：dataURL 字符串，直接可用
  return {
    id: img.id || newImageId(),
    thumbnail: toBlob(img.thumbnail, img.contentType),
    display: toBlob(img.display, img.contentType),
    contentType: img.contentType || 'image/jpeg',
    width: img.width,
    height: img.height
  };
}

/** 写入用：内存格式 → 存储格式（ArrayBuffer） */
async function encodeImageAsset(img) {
  if (!img || isLegacyImage(img)) return img;
  const [thumbnail, display] = await Promise.all([toBuffer(img.thumbnail), toBuffer(img.display)]);
  return {
    id: img.id || newImageId(),
    thumbnail,
    display,
    contentType: img.contentType || 'image/jpeg',
    width: img.width,
    height: img.height
  };
}

/** Dexie reading hook：读库时自动把图片转成 Blob，UI 层无感知 */
function decodeRecipeImages(recipe) {
  if (!recipe || !recipe.images) return recipe;
  return { ...recipe, images: recipe.images.map(decodeImageAsset).filter(Boolean) };
}

/** 写库前调用：把图片转成 ArrayBuffer */
async function encodeRecipeImages(recipe) {
  if (!recipe || !recipe.images) return recipe;
  const images = await Promise.all(recipe.images.map(encodeImageAsset));
  return { ...recipe, images: images.filter(Boolean) };
}

// ============================================
// 图片压缩：生成 display + thumbnail
// ============================================
function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片读取失败'));
    img.src = src;
  });
}

function drawScaled(img, maxSize) {
  const scale = Math.min(1, maxSize / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
  const height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(img, 0, 0, width, height);
  return canvas;
}

function canvasToBuffer(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) { reject(new Error('图片编码失败')); return; }
      blob.arrayBuffer().then(resolve).catch(reject);
    }, 'image/jpeg', quality);
  });
}

/** 从任意来源（File / Blob / dataURL）生成图片资源 */
async function makeImageAsset(source) {
  let src = source;
  let objectUrl = null;
  if (source instanceof Blob) {
    objectUrl = URL.createObjectURL(source);
    src = objectUrl;
  }
  try {
    const img = await loadImageElement(src);
    const [display, thumbnail] = await Promise.all([
      canvasToBuffer(drawScaled(img, IMAGE_DISPLAY_MAX), IMAGE_DISPLAY_QUALITY),
      canvasToBuffer(drawScaled(img, IMAGE_THUMB_MAX), IMAGE_THUMB_QUALITY)
    ]);
    return {
      id: newImageId(),
      thumbnail,
      display,
      contentType: 'image/jpeg',
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height
    };
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

// ============================================
// 渲染用 URL（对象 URL 缓存，避免泄漏）
// ============================================
const IMAGE_URL_CACHE = new Map();
const IMAGE_URL_MAX = 80;

function imageSrc(img, size) {
  if (!img) return '';
  if (isLegacyImage(img)) return img;
  const wantThumb = size === 'thumb' && img.thumbnail;
  const key = img.id ? `${img.id}:${wantThumb ? 't' : 'd'}` : null;
  if (key && IMAGE_URL_CACHE.has(key)) {
    const hit = IMAGE_URL_CACHE.get(key);
    IMAGE_URL_CACHE.delete(key);
    IMAGE_URL_CACHE.set(key, hit);
    return hit;
  }
  const blob = toBlob(wantThumb ? img.thumbnail : (img.display || img.thumbnail), img.contentType);
  if (!blob) return '';
  const url = URL.createObjectURL(blob);
  if (key) {
    IMAGE_URL_CACHE.set(key, url);
    while (IMAGE_URL_CACHE.size > IMAGE_URL_MAX) {
      const oldestKey = IMAGE_URL_CACHE.keys().next().value;
      const oldestUrl = IMAGE_URL_CACHE.get(oldestKey);
      IMAGE_URL_CACHE.delete(oldestKey);
      URL.revokeObjectURL(oldestUrl);
    }
  }
  return url;
}

// ============================================
// 老数据迁移：dataURL 字符串 → 图片资源
// ============================================
async function migrateLegacyImages(onProgress) {
  const recipes = await DB.recipes.toArray();
  let converted = 0;
  for (const recipe of recipes) {
    const images = recipe.images || [];
    if (!images.length || !images.some(isLegacyImage)) continue;
    const assets = [];
    for (const img of images) {
      if (isLegacyImage(img)) {
        try {
          assets.push(await makeImageAsset(img));
        } catch (e) {
          // 单张图片损坏时跳过，不影响其它数据
        }
      } else {
        assets.push(await encodeImageAsset(img));
      }
    }
    await DB.recipes.update(recipe.id, { images: assets });
    converted += 1;
    if (onProgress) onProgress(converted);
  }
  return converted;
}
