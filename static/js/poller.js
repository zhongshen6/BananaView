import { Translator } from './translator.js';
import { Api } from './api.js';
import { UI } from './ui.js';
import { Config } from './config.js';

export const CategoryPoller = (() => {
  const pendingIds = new Set();
  let pollTimer = null;
  const categoryCache = new Map();
  let cacheLoaded = false;
  let consecutiveErrors = 0; // 连续请求错误计数，用于指数退避

  // 加载分类缓存文件
  async function loadCategoryCache(baseUrl = '') {
    if (cacheLoaded) return;
    try {
      // 确保路径拼接正确
      const cleanBase = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
      const res = await fetch(`${cleanBase}static/subcategory_cache.json`);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const cacheData = await res.json();
      
      for (const [itemId, cacheItem] of Object.entries(cacheData)) {
        if (cacheItem.name && cacheItem.name !== "获取中..." && cacheItem.id) {
          // 加载时即进行翻译，确保同步查询时直接拿到中文
          const translatedCategory = Translator.translateCategory(cacheItem.name);
          categoryCache.set(String(itemId), {
            category: translatedCategory,
            catid: cacheItem.id
          });
        }
      }
      cacheLoaded = true;
      console.log('分类缓存加载完成，有效条目数:', categoryCache.size);
    } catch (err) {
      console.warn('加载分类缓存失败，将使用后端API:', err);
      cacheLoaded = true;
    }
  }

  // 获取分类信息（先查缓存）
  function getCategoryInfo(itemId) {
    const idStr = String(itemId);
    return categoryCache.get(idStr) || null;
  }

  // 添加分类ID到轮询队列
  function add(id) {
    id = String(id);
    
    // 如果已经有缓存，UI.createCard 已经处理了渲染，直接返回即可
    if (categoryCache.has(id)) {
      return;
    }
    
    if (!pendingIds.has(id)) {
      pendingIds.add(id);
    }
    ensureTimer();
  }

  // 核心轮询逻辑：带网络指数退避
  async function pollPendingCategories() {
    if (!pendingIds.size) {
      stopTimer();
      return;
    }
    
    const ids = [...pendingIds];

    try {
      const data = await Api.fetchSubcat(ids);
      
      // API 请求成功，重置网络错误计数
      consecutiveErrors = 0;
      
      ids.forEach(id => {
        const info = data?.[id] || data?.[String(id)];
        
        if (info?.category) {
          // 成功获取分类，存入缓存
          categoryCache.set(String(id), info);
          UI.updateCategoryElement(id, info);
          pendingIds.delete(id);
        } else if (info?.status === 'failed') {
          // 后端明确返回该 ID 获取失败
          UI.updateCategoryElement(id, null);
          pendingIds.delete(id);
        }
      });
    } catch (err) {
      consecutiveErrors++;
      console.error(`分类 API 请求失败 (${consecutiveErrors})，采用退避策略:`, err);
    } finally {
      const interval = Math.min(
        Config.BASE_POLL_INTERVAL * Math.pow(Config.BACKOFF_FACTOR, consecutiveErrors),
        Config.MAX_POLL_INTERVAL
      );
      
      if (pendingIds.size > 0) {
        pollTimer = setTimeout(pollPendingCategories, interval);
      } else {
        stopTimer();
      }
    }
  }

  function ensureTimer() {
    if (!pollTimer) {
      pollTimer = setTimeout(pollPendingCategories, Config.BASE_POLL_INTERVAL);
    }
  }

  function stopTimer() {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  return { add, pollPendingCategories, loadCategoryCache, getCategoryInfo };
})();