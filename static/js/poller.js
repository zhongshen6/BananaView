window.CategoryPoller = (() => {
  const pendingIds = new Set();
  let pollTimer = null;
  const categoryCache = new Map();
  let cacheLoaded = false;
  let consecutiveErrors = 0; // 连续请求错误计数，用于指数退避

  // 加载分类缓存文件
  async function loadCategoryCache() {
    if (cacheLoaded) return;
    try {
      const res = await fetch('static/subcategory_cache.json');
      const cacheData = await res.json();
      
      for (const [itemId, cacheItem] of Object.entries(cacheData)) {
        if (cacheItem.name && cacheItem.name !== "获取中..." && cacheItem.id) {
          const translatedCategory = window.Translator.translateCategory(cacheItem.name);
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
    
    // 先检查前端缓存
    const cachedInfo = getCategoryInfo(id);
    if (cachedInfo) {
      window.UI.updateCategoryElement(id, cachedInfo);
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
      const data = await window.Api.fetchSubcat(ids);
      
      // API 请求成功，重置网络错误计数
      consecutiveErrors = 0;
      
      ids.forEach(id => {
        const info = data?.[id] || data?.[String(id)];
        
        if (info?.category) {
          // 成功获取分类
          window.UI.updateCategoryElement(id, info);
          pendingIds.delete(id);
        } else if (info?.status === 'failed') {
          // 后端明确返回该 ID 获取失败
          window.UI.updateCategoryElement(id, null);
          pendingIds.delete(id);
        }
      });
    } catch (err) {
      consecutiveErrors++;
      console.error(`分类 API 请求失败 (${consecutiveErrors})，采用退避策略:`, err);
    } finally {
      const interval = Math.min(
        window.Config.BASE_POLL_INTERVAL * Math.pow(window.Config.BACKOFF_FACTOR, consecutiveErrors),
        window.Config.MAX_POLL_INTERVAL
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
      pollTimer = setTimeout(pollPendingCategories, window.Config.BASE_POLL_INTERVAL);
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