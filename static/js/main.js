// 每次修改后修改次数加一，并另起一行写下这次的修改内容
// 第17次修改，将列表卡片的外部链接修改为指向内部详情页路由 /mod/api/id/<id>，实现无缝聚合浏览体验。
// 第18次修改，分离代码，优化结构
// 第19次修改，转向 ES6 Modules (ESM)
// 第20次修改，重构 SPA 初始化逻辑：优先处理 URL 路由，立即打开详情页，不阻塞列表加载，解决直接访问 ID 页面白屏或延迟问题。
// 第21次修改，修正 CategoryPoller 初始化路径
// 第22次修改，重构 refresh 逻辑，通过重置 tabStates 强制触发 API 刷新以应用筛选设置
// 第23次修改，引入加载版本控制 (currentLoadId)，解决切换筛选条件时的异步竞态问题，防止旧数据混入新列表。
// 第24次修改，更新 SPA 详情页路由规范为 /mod/api/{model}/{id}，支持帖子/问题/悬赏等多种内容。

import { Config, DOM } from './config.js';
import { Settings } from './settings.js';
import { Translator } from './translator.js';
import { Api } from './api.js';
import { UI } from './ui.js';
import { CategoryPoller } from './poller.js';
import { Controls } from './controls.js';
import { Toast } from './toast.js';
import { loadDetail } from './detail.js';

export const App = (() => {
  // 多轨道状态管理
  const tabStates = {
    'recommended': { items: [], page: 1, noMore: false, scrollY: 0 },
    'latest': { items: [], page: 1, noMore: false, scrollY: 0 },
    'updated': { items: [], page: 1, noMore: false, scrollY: 0 },
    'subscriptions': { items: [], page: 1, noMore: false, scrollY: 0 }
  };

  let currentMode = Config.DEFAULT_MODE;
  let loading = false;
  let currentLoadId = 0; // 加载版本 ID，用于解决竞态问题

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      // 滚动触发时，使用当前的全局 ID
      if (entry.isIntersecting && !tabStates[currentMode].noMore && !loading) {
        loadThreePages(false, currentLoadId);
      }
    });
  }, { rootMargin: Config.SCROLL_ROOT_MARGIN });

  // 核心：切换分类 (多轨道恢复)
  async function setMode(mode, text = '') {
    if (mode === currentMode && tabStates[mode].items.length > 0) return;

    // 1. 递增加载 ID，立即使之前的异步循环失效
    currentLoadId++;
    const myLoadId = currentLoadId;
    loading = false; // 强制释放旧锁

    // 2. 保存当前状态
    tabStates[currentMode].scrollY = window.scrollY;
    
    // 3. 切换新分类
    currentMode = mode;
    const state = tabStates[mode];
    
    // 4. UI 更新
    DOM.MODS_CONTAINER.innerHTML = '';
    if (DOM.menuBtn && text) DOM.menuBtn.textContent = text + ' ▼';

    if (state.items.length > 0) {
      // 轨道内有缓存：瞬间恢复
      state.items.forEach(item => {
        const card = UI.createCard(item);
        DOM.MODS_CONTAINER.appendChild(card);
      });
      UI.layoutMasonry();
      UI.applyNSFWPolicy(Settings.get('nsfwMode'));
      window.scrollTo(0, state.scrollY);
    } else {
      // 无缓存：首次加载，传入 myLoadId
      await loadThreePages(true, myLoadId);
    }
  }

  function formatTime(ts) {
    if (!ts) return Config.STRINGS.UNKNOWN;
    const now = Math.floor(Date.now() / 1000);
    const diff = now - parseInt(ts, 10);
    if (diff < 86400) return '今天';
    const d = new Date(ts * 1000);
    return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
  }

  async function loadMods(myLoadId) {
    const state = tabStates[currentMode];
    
    // 基础检查：如果 ID 已经过时，或者正在加载，或者已经到底了
    if (myLoadId !== currentLoadId || loading || state.noMore) return;
    
    loading = true;
    UI.showLoader(true);

    const skeletons = UI.showSkeleton(Config.INITIAL_SKELETON_COUNT);

    try {
      const quality = Settings.get('thumbQuality') || Config.DEFAULT_THUMB_QUALITY;
      const url = Api.getApiUrl(currentMode, state.page);
      if (!url) throw new Error('URL Invalid');

      const response = await fetch(url);
      
      // 关键检查点 1：请求返回后检查 ID
      if (myLoadId !== currentLoadId) return;

      const data = await response.json();
      
      // 关键检查点 2：数据解析后检查 ID
      if (myLoadId !== currentLoadId) return;

      const records = data?._aRecords || [];

      if (!records.length) {
        state.noMore = true;
        UI.clearSkeleton();
        UI.showLoader(true, Config.STRINGS.NO_MORE);
        return;
      }

      const items = [];
      for (const r of records) {
        let source = r;
        if (currentMode === 'subscriptions' && r._aSubscription) source = r._aSubscription;
        const model = source?._sModelName;
        const item_id = source?._idRow;

        let thumb = null;
        try {
          const img = source?._aPreviewMedia?._aImages?.[0];
          if (img) {
            let base = (img._sBaseUrl || '').replace(/\/$/, '');
            let file = quality === '220' ? img._sFile220 : img._sFile530;
            if (!file) file = img._sFile530 || img._sFile220 || img._sFile;
            thumb = base + '/' + file;
          }
        } catch (e) {}

        const tsAdded = parseInt(source?._tsDateAdded || 0, 10);

        items.push({
          id: item_id, model, name: source?._sName,
          author: source?._aSubmitter?._sName || '未知',
          author_url: source?._aSubmitter?._sProfileUrl || '#',
          thumb, snippet: source?._sSnippet,
          category: model === 'Mod' ? '获取中...' : model,
          date_added: formatTime(tsAdded),
          likes: source?._nLikeCount || 0, views: source?._nViewCount || 0,
          nsfw: !!source?._bHasContentRatings
        });
      }

      const translatedItems = Translator.translateContent(items);
      
      // 最终确认：在操作 DOM 和修改状态前检查 ID
      if (myLoadId !== currentLoadId) return;

      state.items.push(...translatedItems);

      translatedItems.forEach((item, index) => {
        const card = UI.createCard(item);
        UI.appendCardOrReplaceSkeleton(card, skeletons, index);
      });

      UI.layoutMasonry();
      UI.applyNSFWPolicy(Settings.get('nsfwMode'));
    } catch (error) {
      if (myLoadId === currentLoadId) {
        UI.clearSkeleton();
      }
    } finally {
      // 只有最新的任务有权修改全局 loading 状态
      if (myLoadId === currentLoadId) {
        loading = false;
        UI.showLoader(state.noMore);
      }
    }
  }

  async function loadThreePages(isInitial = false, myLoadId = currentLoadId) {
    const state = tabStates[currentMode];
    for (let i = 0; i < 3; i++) {
      // 循环内部检查版本
      if (myLoadId !== currentLoadId) {
        console.log(`[Abort] 旧的加载请求 (ID: ${myLoadId}) 已被中止`);
        return;
      }
      
      if (!isInitial) state.page++;
      await loadMods(myLoadId);
      isInitial = false;
      if (state.noMore) break;
    }
  }

  // --- SPA 路由逻辑 ---
  function openDetail(id, model = 'Mod', isInitial = false) {
    if (DOM.detailOverlay) DOM.detailOverlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // 背景静止
    
    const url = `/mod/api/${model}/${id}`;
    const stateData = { detailId: id, detailModel: model };

    // 如果是初始加载，使用 replaceState 避免回退历史错误
    if (isInitial) {
        history.replaceState(stateData, '', url);
    } else if (window.location.pathname !== url) {
        history.pushState(stateData, '', url);
    }
    
    loadDetail(id, model);
  }

  function closeDetail(fromPopState = false) {
    if (DOM.detailOverlay) DOM.detailOverlay.classList.add('hidden');
    document.body.style.overflow = '';
    if (!fromPopState) history.pushState(null, '', '/mod/');
  }

  // 监听浏览器返回
  window.addEventListener('popstate', (e) => {
    if (e.state && e.state.detailId) {
      openDetail(e.state.detailId, e.state.detailModel || 'Mod');
    } else {
      closeDetail(true);
    }
  });

  async function initializeApp() {
    Settings.load();
    Controls.setApp(App);
    Controls.initAll();
    
    // 立即注册关键事件绑定
    window.addEventListener('open-detail', (e) => openDetail(e.detail.id, e.detail.model));
    window.addEventListener('go-home', () => {
        closeDetail();
        window.scrollTo({top: 0, behavior: 'smooth'});
    });
    if (DOM.closeDetail) DOM.closeDetail.onclick = () => closeDetail();

    // 并行初始化数据请求
    const dataInitPromises = [
        Translator.loadTranslationTable('/mod/'),
        CategoryPoller.loadCategoryCache('/mod/')
    ];

    // 路由判断：是否直接访问了详情页，现在匹配 /mod/api/{model}/{id}
    const match = window.location.pathname.match(/\/api\/([^\/]+)\/(\d+)/);
    
    if (match) {
        const initialModel = match[1];
        const initialId = match[2];
        console.log(`[Router] 初始进入详情页: Model ${initialModel}, ID ${initialId}`);
        openDetail(initialId, initialModel, true);
        
        Promise.all(dataInitPromises).then(() => {
            loadThreePages(true).then(() => {
                if (DOM.SENTINEL) observer.observe(DOM.SENTINEL);
            });
        });
    } else {
        await Promise.all(dataInitPromises);
        if (DOM.SENTINEL) observer.observe(DOM.SENTINEL);
        await loadThreePages(true);
    }
  }

  return { 
    initializeApp, 
    setMode, 
    refresh: () => {
      // 强制更新版本 ID
      currentLoadId++;
      loading = false;

      // 强制重置所有分类轨道的数据
      Object.keys(tabStates).forEach(m => {
        tabStates[m].items = [];
        tabStates[m].page = 1;
        tabStates[m].noMore = false;
      });
      setMode(currentMode);
    }
  };
})();

document.addEventListener('DOMContentLoaded', () => App.initializeApp());
