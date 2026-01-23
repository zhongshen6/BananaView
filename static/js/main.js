import { Config, DOM } from './config.js';
import { Settings } from './settings.js';
import { Translator } from './translator.js';
import { Api } from './api.js';
import { UI } from './ui.js';
import { CategoryPoller } from './poller.js';
import { Controls } from './controls.js';
import { Toast } from './toast.js';

export const App = (() => {
  let page = 1;
  let loading = false;
  let noMore = false;
  let currentMode = Config.DEFAULT_MODE;

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !noMore) loadThreePages();
    });
  }, { rootMargin: Config.SCROLL_ROOT_MARGIN });

  function setMode(mode, text = '') {
    currentMode = mode;
    page = 1;
    noMore = false;
    DOM.MODS_CONTAINER.innerHTML = '';
    if (DOM.menuBtn && text) DOM.menuBtn.textContent = text + ' ▼';
    loadThreePages(true);
  }

  function refresh() {
    page = 1;
    noMore = false;
    DOM.MODS_CONTAINER.innerHTML = '';
    loadThreePages(true);
  }

  function formatTime(ts) {
    if (!ts) return Config.STRINGS.UNKNOWN;
    const now = Math.floor(Date.now() / 1000);
    const diff = now - parseInt(ts, 10);
    if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
    if (diff < 259200) return Math.floor(diff / 86400) + ' 天前';
    const date = new Date(ts * 1000);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  async function loadMods() {
    if (loading || noMore) return;
    loading = true;
    UI.showLoader(true);

    const skeletons = UI.showSkeleton(Config.INITIAL_SKELETON_COUNT);

    try {
      const quality = Settings.get('thumbQuality') || Config.DEFAULT_THUMB_QUALITY;
      const filter = Settings.get('contentFilter') || 'all';
      const url = Api.getApiUrl(currentMode, page);
      if (!url) throw new Error('Invalid URL');

      const response = await fetch(url);
      const data = await response.json();
      const records = data?._aRecords || [];

      if (!records.length) {
        noMore = true;
        UI.clearSkeleton();
        UI.showLoader(true, Config.STRINGS.NO_MORE);
        loading = false;
        return;
      }

      const items = [];
      const categoryIdsToFetch = [];
      const allowedModels = ['Mod', 'Tool', 'Question', 'Thread', 'Request'];

      for (const r of records) {
        let source = r;
        if (currentMode === 'subscriptions' && r._aSubscription) source = r._aSubscription;

        const model = source?._sModelName;
        if (filter !== 'all' && !allowedModels.includes(model)) continue;

        const item_id = source?._idRow;
        let cat_name = null;

        if (model === 'Mod' || model === 'Tool') {
          cat_name = Config.STRINGS.GETTING;
          categoryIdsToFetch.push(item_id);
        } else if (model === 'Request') {
          cat_name = source._nBounty ? `赏金: ${source._nBounty}` : '悬赏';
        } else if (model === 'Question') {
          cat_name = source._sState === 'Answered' ? '✅ 已回答' : '❓ 待解决';
        } else if (model === 'Thread') {
          cat_name = `${source._nPostCount || 0} 条回复`;
        } else {
          cat_name = model || '其他';
        }

        let thumb = null;
        try {
          const img = source?._aPreviewMedia?._aImages?.[0];
          if (img) {
            let base = (img._sBaseUrl || '').replace(/\/$/, '');
            let file = quality === '220' ? img._sFile220 : img._sFile530;
            if (!file) file = img._sFile530 || img._sFile220 || img._sFile;
            if (base && file) {
              if (!base.startsWith('http')) base = 'https://' + base.replace(/^\/+/, '');
              thumb = base + '/' + file;
            }
          }
        } catch (e) { }

        const tsAdded = parseInt(source?._tsDateAdded || 0, 10);
        const tsModified = parseInt(source?._tsDateModified || 0, 10);

        items.push({
          id: item_id, model, name: source?._sName,
          author: source?._aSubmitter?._sName || Config.STRINGS.UNKNOWN,
          author_url: source?._aSubmitter?._sProfileUrl || '#',
          thumb, snippet: source?._sSnippet,
          category: cat_name, catid: source?._aRootCategory?._idRow,
          date_added: formatTime(tsAdded), date_modified: formatTime(tsModified),
          has_update: tsModified > tsAdded, likes: source?._nLikeCount || 0,
          views: source?._nViewCount || 0, nsfw: !!source?._bHasContentRatings
        });
      }

      const translatedItems = Translator.translateContent(items);

      translatedItems.forEach((item, index) => {
        const card = UI.createCard(item);
        UI.appendCardOrReplaceSkeleton(card, skeletons, index);
      });

      UI.layoutMasonry();
      UI.applyNSFWPolicy(Settings.get('nsfwMode'));

      if (categoryIdsToFetch.length) {
        categoryIdsToFetch.forEach(id => CategoryPoller.add(id));
      }

      loading = false;
    } catch (error) {
      UI.clearSkeleton();
      UI.showLoader(true, Config.STRINGS.LOADING_FAILED);
      loading = false;
    } finally {
      UI.showLoader(noMore);
    }
  }

  async function loadThreePages(isInitial = false) {
    for (let i = 0; i < 3; i++) {
      if (!isInitial) page++;
      await loadMods();
      isInitial = false;
      if (noMore) break;
    }
  }

  async function initializeApp() {
    Settings.load();
    Controls.setApp(App); // 注入 App 实例给 Controls 以便调用刷新
    Controls.initAll();
    await Translator.loadTranslationTable();
    await CategoryPoller.loadCategoryCache();
    if (DOM.SENTINEL) observer.observe(DOM.SENTINEL);
    await loadThreePages(true);
    Toast.show('欢迎回来！', 'success', 2500);
  }

  return { initializeApp, setMode, refresh };
})();

document.addEventListener('DOMContentLoaded', () => {
  App.initializeApp();
});