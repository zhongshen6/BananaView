
(() => {
  'use strict';

  // ================================================== Config ==================================================
  //应用配置常量
  const Config = {
    PER_SKELETON: 4, // 每次加载显示的骨架屏数量
    BASE_POLL_INTERVAL: 5000, // 基础分类信息轮询间隔(毫秒)
    MAX_POLL_INTERVAL: 30000, // 最大轮询间隔(退避上限)
    BACKOFF_FACTOR: 2, // 网络错误时的退避系数
    INITIAL_SKELETON_COUNT: 8, // 初始骨架屏数量
    SCROLL_ROOT_MARGIN: '100px', // 无限滚动触发边界
    DEFAULT_MODE: 'recommended', // 默认显示模式
    DEFAULT_COLUMN_BREAKPOINTS: { sm: 768, md: 1024 }, // 响应式布局断点
    DEFAULT_THUMB_QUALITY: '530', // 默认缩略图质量
    STRINGS: {
      LOADING_FAILED: '加载失败，稍后重试',
      NO_MORE: '没有更多了',
      GETTING: '获取中...',
      UNKNOWN: '未知',
      USERID_NOT_NUM: '用户ID必须是数字'
    }
  };

  // ================================================== DOM refs ==================================================
  //DOM元素引用集合
  const DOM = {
    MODS_CONTAINER: document.getElementById('mods'), // Mod卡片容器
    LOADER: document.getElementById('loader'), // 加载指示器
    SENTINEL: document.getElementById('sentinel'), // 无限滚动观察点
    BACK_TOP: document.getElementById('backTop'), // 回到顶部按钮
    SETTINGS_BTN: document.getElementById('settingsBtn'), // 设置按钮
    SETTINGS_MODAL: document.getElementById('settingsModal'), // 设置模态框
    CLOSE_SETTINGS: document.getElementById('closeSettings'), // 关闭设置按钮
    menuList: document.getElementById('menuList'), // 下拉菜单列表
    menuBtn: window.menuBtn || document.getElementById('menuBtn'), // 菜单按钮
    howToBtn: document.getElementById('howToBtn'), // 使用说明按钮
    howToPopover: document.getElementById('howToPopover'), // 使用说明弹出框
    userIdInput: document.getElementById('userIdInput'), // 用户ID输入框
    thumbQualitySlider: document.getElementById('thumbQualitySlider'), // 缩略图质量滑块
    columnCountSlider: document.getElementById('columnCountSlider'), // 列数滑块
    howToPopoverArrow: document.getElementById('howToPopover')?.querySelector('.popover-arrow'), // 弹出框箭头
    closePopoverBtn: document.getElementById('howToPopover')?.querySelector('.btn-close-popover'), // 关闭弹出框按钮
    topbar: document.querySelector('.topbar'), // 顶部导航栏
    toastContainer: document.getElementById('toastContainer'), // 通知容器
  };

  // ================================================== 通知模块 ==================================================
  // 负责全局轻量级消息提醒
  const Toast = (() => {
    /**
     * 显示一条通知
     * @param {string} message 消息内容
     * @param {string} type 类型: info, success, error
     * @param {number} duration 持续时间(ms)
     */
    function show(message, type = 'info', duration = 3000) {
      if (!DOM.toastContainer) return;

      const toast = document.createElement('div');
      toast.className = `toast ${type}`;
      toast.textContent = message;

      DOM.toastContainer.appendChild(toast);

      // 进场动画触发
      requestAnimationFrame(() => {
        toast.classList.add('show');
      });

      // 自动销毁
      setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => {
          toast.remove();
        });
      }, duration);
    }

    return { show };
  })();

  // ================================================== 设置模块 ==================================================
  //设置管理模块

const Settings = (() => {
  const STORAGE_KEY = 'mods_settings_v1'; // 本地存储键名
  let state = {
    thumbQuality: Config.DEFAULT_THUMB_QUALITY, // 缩略图质量
    columnCount: 0, // 列数(0表示自动)
    userId: '', // 用户ID
    nsfwMode: 'show',
    contentFilter: 'all', // 筛选：all / mods / posts
  };

  //从本地存储加载设置
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state = Object.assign(state, parsed);
      }
    } catch (e) {
      console.warn('Settings load error', e);
    }
    return state;
  }

  //保存设置到本地存储
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Settings save error', e);
    }
  }

  //获取指定设置项的值
  function get(key) {
    return state[key];
  }

  //设置指定项的值并保存
  function set(key, val) {
    state[key] = val;
    save();
  }

  //获取所有设置
  function all() {
    return state;
  }

  return { load, save, get, set, all };
})();

  // ================================================== Api模块 ==================================================
  //负责构建API URL和执行网络请求
  const Api = (() => {
    // 定义包含的所有模型类型
    const ALL_NON_MOD_MODELS = 'Tool,Question,Thread,Request';

    //根据模式和页码构建API URL
    function getApiUrl(mode, pageNum = 1) {
      const filter = Settings.get('contentFilter') || 'all';
      let inclusions = '';
      
      if (filter === 'mods') {
        // 仅模组模式
        inclusions = '&_csvModelInclusions=Mod';
      } else if (filter === 'posts') {
        // 仅帖子模式：包含除 Mod 之外的所有内容
        inclusions = `&_csvModelInclusions=${ALL_NON_MOD_MODELS}`;
      } else {
        // 全部模式：去掉 Inclusion 选项，获取全部类型
        inclusions = '';
      }

      switch (mode) {
        case 'recommended':
          return `https://gamebanana.com/apiv11/Game/8552/Subfeed?_sSort=default${inclusions}&_nPage=${pageNum}`;
        case 'latest':
          return `https://gamebanana.com/apiv11/Game/8552/Subfeed?_sSort=new${inclusions}&_nPage=${pageNum}`;
        case 'updated':
          return `https://gamebanana.com/apiv11/Game/8552/Subfeed?_sSort=updated${inclusions}&_nPage=${pageNum}`;
        case 'subscriptions': {
          const userId = Settings.get('userId');
          if (!userId) return null;
          return `https://gamebanana.com/apiv11/Member/${userId}/Subscriptions?_nPage=${pageNum}`;
        }
        default:
          return null;
      }
    }

    //执行JSON网络请求
    async function fetchJson(url) {
      if (!url) throw new Error('Invalid API URL');
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Network error: ${res.status}`);
      return res.json();
    }

    //获取分类信息
    async function fetchSubcat(ids) {
      if (!Array.isArray(ids) || !ids.length) return {};
      const url = `/mod/api/subcat?ids=${ids.join(',')}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('分类别请求失败');
      const data = await res.json();
      
      // 新增：对返回的分类信息进行翻译
      return Translator.translateContent(data);
    }

    return { getApiUrl, fetchJson, fetchSubcat };
  })();

  // ================================================== 分类获取模块 ==================================================
  //负责批量请求分类信息并处理重试逻辑
  const CategoryPoller = (() => {
      const pendingIds = new Set();
      let pollTimer = null;
      const categoryCache = new Map();
      let cacheLoaded = false;
      let consecutiveErrors = 0; // 连续请求错误计数，用于指数退避

      // 加载分类缓存文件
      async function loadCategoryCache() {
        if (cacheLoaded) return;
        try {
          const res = await fetch('/mod/static/subcategory_cache.json');
          const cacheData = await res.json();
          
          for (const [itemId, cacheItem] of Object.entries(cacheData)) {
            if (cacheItem.name && cacheItem.name !== "获取中..." && cacheItem.id) {
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
        
        // 先检查前端缓存
        const cachedInfo = getCategoryInfo(id);
        if (cachedInfo) {
          UI.updateCategoryElement(id, cachedInfo);
          return;
        }
        
        if (!pendingIds.has(id)) {
          pendingIds.add(id);
        }
        ensureTimer();
      }

      // 核心轮询逻辑：带网络指数退避，持续轮询直到结果返回
      async function pollPendingCategories() {
        if (!pendingIds.size) {
          stopTimer();
          return;
        }
        
        const ids = [...pendingIds];
        console.log(`执行分类轮询，待处理: ${pendingIds.size}，网络连续错误: ${consecutiveErrors}`);

        try {
          const data = await Api.fetchSubcat(ids);
          
          // API 请求成功，重置网络错误计数
          consecutiveErrors = 0;
          
          ids.forEach(id => {
            const info = data?.[id] || data?.[String(id)];
            
            if (info?.category) {
              // 成功获取分类
              UI.updateCategoryElement(id, info);
              pendingIds.delete(id);
            } else if (info?.status === 'failed') {
              // 后端明确返回该 ID 获取失败（如超时或不存在）
              UI.updateCategoryElement(id, null);
              pendingIds.delete(id);
            }
            // 如果是 pending 状态，保持在 pendingIds 中继续下一轮轮询
          });
        } catch (err) {
          consecutiveErrors++;
          console.error(`分类 API 请求失败 (${consecutiveErrors})，采用退避策略:`, err);
        } finally {
          // 根据网络状况计算下一次轮询的间隔
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
  // ================================================== 翻译模块 ==================================================
  //翻译模块
  const Translator = (() => {
    const translationMap = new Map(); // 翻译映射表
    let isLoaded = false; // 翻译表是否已加载
    let sortedKeys = null; // 按长度排序的键列表(用于最长匹配)

    //加载翻译表
    async function loadTranslationTable() {
      if (isLoaded) return;
      try {
        const res = await fetch('/mod/static/words-frontend.json');
        const words = await res.json();
        for (const word of words) {
          if (word.en && word.zhCN) {
            const englishKey = word.en.replace(/^\"+|\"+$/g, '').toLowerCase();
            translationMap.set(englishKey, word.zhCN);
          }
        }
        // 创建按长度降序排列的键列表，确保最长匹配优先
        sortedKeys = Array.from(translationMap.keys()).sort((a, b) => b.length - a.length);
        isLoaded = true;
        console.log('翻译表加载完成，条目数:', translationMap.size);
      } catch (err) {
        console.error('加载翻译表失败:', err);
      }
    }

    //翻译分类名称功能
    function translateCategory(category) {
      if (!isLoaded || !category) return category;
      const key = category.toLowerCase();
      return translationMap.get(key) || category;
    }

    //翻译Mod名称功能
    function translateModName(name) {
      if (!isLoaded || !name) return name;
      let result = name;
      const lower = () => result.toLowerCase();
      for (const key of sortedKeys) {
        const idx = lower().indexOf(key);
        if (idx !== -1) {
          // 单词边界启发式检查
          const isWordBoundary = (
            (idx === 0 || !result[idx - 1].match(/[a-z]/i)) &&
            (idx + key.length === result.length || !result[idx + key.length].match(/[a-z]/i))
          );
          if (isWordBoundary) {
            const originalCase = result.substring(idx, idx + key.length);
            let replacement = translationMap.get(key);
            if (!replacement) continue;
            // 保持原始大小写格式
            if (originalCase === originalCase.toUpperCase()) replacement = replacement.toUpperCase();
            else if (originalCase[0] === originalCase[0].toUpperCase())
              replacement = replacement.charAt(0).toUpperCase() + replacement.slice(1);
            result = result.substring(0, idx) + replacement + result.substring(idx + key.length);
          }
        }
      }
      return result;
    }

    //执行翻译内容数据
    function translateContent(data) {
      if (!isLoaded) return data;
      if (Array.isArray(data)) {
        // 数组：翻译每个mod的名称和分类
        return data.map(mod => ({
          ...mod,
          name: mod.name ? translateModName(mod.name) : mod.name,
          category: mod.category ? translateCategory(mod.category) : mod.category
        }));
      } else if (typeof data === 'object' && data !== null) {
        // 对象：翻译分类信息
        const result = {};
        for (const id in data) {
          if (data[id] && (data[id].category || data[id].status)) {
            if (data[id].category) {
              result[id] = { ...data[id], category: translateCategory(data[id].category) };
            } else {
              result[id] = data[id];
            }
          } else {
            result[id] = data[id];
          }
        }
        return result;
      }
      return data;
    }

    return { 
      loadTranslationTable, 
      translateCategory, 
      translateModName, 
      translateContent, 
      isLoaded: () => isLoaded 
    };
  })();

  // ================================================== UI模块 ==================================================
  //用户界面模块，负责DOM渲染、布局管理和UI状态控制
  const UI = (() => {
    const container = DOM.MODS_CONTAINER;
    const loader = DOM.LOADER;
    let lastLayoutSize = { w: 0, h: 0 }; // 上次布局时的容器尺寸

    //显示骨架屏占位符
    function showSkeleton(count = Config.PER_SKELETON) {
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < count; i++) {
        const skeleton = document.createElement('div');
        skeleton.className = 'card skeleton';
        skeleton.dataset.skeleton = 'true';
        skeleton.style.height = '220px';
        skeleton.innerHTML = `
          <div class="s-thumb"></div>
          <div style="padding:12px;">
              <div class="s-line" style="width:70%"></div>
              <div class="s-line" style="width:50%"></div>
              <div class="s-line" style="width:40%"></div>
          </div>
        `;
        fragment.appendChild(skeleton);
      }
      container.appendChild(fragment);
      layoutMasonry(); // 添加后重新布局
      return Array.from(container.children).slice(-count);
    }

    //清除所有骨架屏
    function clearSkeleton() {
      container.querySelectorAll('.card.skeleton').forEach(el => el.remove());
      layoutMasonry();
    }

    // 创建卡片元素（支持多模型类型）
    function createCard(item) {
      const card = document.createElement('article');
      const modelLower = item.model.toLowerCase();
      card.className = `card mod-card type-${modelLower}`;
      card.dataset.id = item.id;
      card.dataset.nsfw = item.nsfw ? 'true' : 'false';

      // 标签逻辑：Mod/Tool 显示 SFW/NSFW，其他显示类型名称
      let tagHtml = '';
      if (item.model === 'Mod' || item.model === 'Tool') {
        tagHtml = item.nsfw ? `<span class="nsfw-tag">NSFW</span>` : `<span class="sfw-tag">SFW</span>`;
      } else {
        const labels = { 'Question': '💡 问题', 'Request': '💰 悬赏', 'Thread': '💬 讨论' };
        tagHtml = `<span class="type-tag">${labels[item.model] || item.model}</span>`;
      }

      // 缩略图/摘要逻辑：有图显示图，无图显示摘要文本
      let thumbHtml = '';
      const profileUrl = `https://gamebanana.com/${modelLower}s/${item.id}`;
      
      if (item.thumb) {
        thumbHtml = `<a class="thumb" href="${profileUrl}" target="_blank" rel="noopener noreferrer">
             <img loading="lazy" src="${escapeAttr(item.thumb)}" alt="${escapeHtml(item.name || '')}">
           </a>`;
      } else if (item.snippet) {
        // 无图时显示文本摘要，增加特殊样式类 .snippet-thumb
        thumbHtml = `<a class="thumb snippet-thumb" href="${profileUrl}" target="_blank" rel="noopener noreferrer">
             <div class="snippet-text">${escapeHtml(item.snippet)}</div>
           </a>`;
      } else {
        thumbHtml = `<div class="thumb no-img"><span>无图</span></div>`;
      }

      // 标题 HTML
      const titleHtml = `
        <h3 class="title">
            <a href="${profileUrl}" target="_blank" rel="noopener noreferrer">
                ${escapeHtml(item.name || '（无标题）')}
            </a>
        </h3>
      `;

      // 分类/元数据处理：Mod/Tool 保持原有分类轮询，其他类型直接显示传递的元数据
      let categoryText = item.category || Config.STRINGS.GETTING;
      let categoryClass = (item.model === 'Mod' && categoryText === Config.STRINGS.GETTING) ? 'pending' : '';
      let categoryHref = item.catid ? `https://gamebanana.com/${modelLower}s/cats/${item.catid}` : '#';

      const bodyHtml = `
        <div class="card-body">
            <div>
                <div class="meta">
                    作者: <a href="${escapeAttr(item.author_url || '#')}" target="_blank" rel="noopener noreferrer">
                        ${escapeHtml(item.author || '未知')}
                    </a>
                </div>
                <div class="dates">
                    发布: ${escapeHtml(item.date_added)}
                </div>
            </div>
            <div class="row-stats">
                <div class="row">
                    <div class="chips">
                        <a class="chip category ${categoryClass}" 
                           href="${categoryHref}" 
                           data-id="${item.id}">
                            ${escapeHtml(categoryText)}
                        </a>
                    </div>
                </div>
                <div class="statsMini">
                    👍${escapeHtml(String(item.likes || 0))}   &nbsp; 👁️${escapeHtml(String(item.views || 0))}
                </div>
            </div>                  
        </div>
      `;

      card.innerHTML = `${tagHtml}${thumbHtml}${titleHtml}${bodyHtml}`;

      const image = card.querySelector('.thumb img');
      if (image) image.onload = () => requestAnimationFrame(layoutMasonry);

      // 只有 Mod 且分类 pending 时才加入轮询
      if (item.model === 'Mod' && categoryClass === 'pending') {
        CategoryPoller.add(item.id);
      }

      return card;
    }

    //HTML转义函数
    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/歪/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    //HTML属性转义函数
    function escapeAttr(str) {
      return String(str)
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    //更新分类元素显示
    function updateCategoryElement(id, info) {
      const selector = `.mod-card .category[data-id="${id}"], .card .category[data-id="${id}"]`;
      const el = document.querySelector(selector);
      if (!el) return;

      if (info?.category) {
        // 成功获取分类信息
        el.textContent = info.category;
        el.dataset.status = 'done';
        el.classList.remove('pending');
        if (info.catid) el.href = `https://gamebanana.com/mods/cats/${info.catid}`;
      } else {
        // 获取分类信息失败或明确标记为失败
        el.textContent = Config.STRINGS.UNKNOWN;
        el.dataset.status = 'done';
        el.classList.remove('pending');
      }
      el.style.display = '';
    }

    // ---------- 瀑布流布局函数 ----------
    //计算当前应显示的列数
    function getColumnCount() {
      const userColumns = Settings.get('columnCount') || 0;
      if (userColumns === 1 || userColumns === '1') return 1; // 用户明确设置为1列
      const width = container.clientWidth;
      // 响应式列数计算
      if (width <= Config.DEFAULT_COLUMN_BREAKPOINTS.sm) return 2;
      if (width <= Config.DEFAULT_COLUMN_BREAKPOINTS.md) return 3;
      return 4;
    }

    //执行瀑布流布局，根据列数计算每个卡片的位置
    function layoutMasonry() {
      // 避免在无关紧要的尺寸变化时重复计算
      const current = { w: container.clientWidth, h: container.clientHeight };
      if (lastLayoutSize.w === current.w && lastLayoutSize.h === current.h) {
        // 尺寸未变化，但仍允许外部触发重新定位
      }
      lastLayoutSize = current;

      const cards = Array.from(container.children).filter(c => c.style.display !== 'none');
      const columnCount = getColumnCount();
      const gap = parseInt(getComputedStyle(container).getPropertyValue('--gap')) || 16;

      // 单列布局模式
      if (columnCount === 1) {
        cards.forEach(card => {
          card.style.position = 'relative';
          card.style.transform = 'none';
          card.style.width = '100%';
          card.classList.add('horizontal');
        });
        container.style.height = 'auto';
        return;
      }

      // 多列瀑布流布局
      const columnWidth = (container.clientWidth - gap * (columnCount - 1)) / columnCount;
      const columnHeights = Array(columnCount).fill(0); // 每列的当前高度

      cards.forEach(card => {
        card.classList.remove('horizontal');
        card.style.width = `${columnWidth}px`;
        card.style.position = 'absolute';

        // 找到当前最短的列
        const minColumnIndex = columnHeights.indexOf(Math.min(...columnHeights));
        const x = Math.round((columnWidth + gap) * minColumnIndex);
        const y = Math.round(columnHeights[minColumnIndex]);

        card.style.transform = `translate(${x}px, ${y}px)`;
        columnHeights[minColumnIndex] += card.offsetHeight + gap;
      });

      // 设置容器高度为最高列的高度
      container.style.height = `${Math.max(...columnHeights) || 0}px`;
    }

    //添加卡片或替换骨架屏
    function appendCardOrReplaceSkeleton(card, skeletons, index) {
      const skeleton = skeletons && skeletons[index];
      if (skeleton && skeleton.isConnected) {
        // 替换对应的骨架屏
        skeleton.replaceWith(card);
      } else {
        // 直接添加到容器
        container.appendChild(card);
      }
    }

    //显示或隐藏加载指示器
    function showLoader(show, text) {
      if (!loader) return;
      loader.style.display = show ? 'block' : 'none';
      if (text) loader.textContent = text;
    }

    // UI 模块内更新：根据 nsfwMode 处理卡片策略，新增 only 模式
    function applyNSFWPolicy(mode = 'hide') {
      try {
        const cards = Array.from(container.querySelectorAll('.mod-card'));
        cards.forEach(card => {
          const isNsfw = card.dataset.nsfw === 'true';
          // 清理之前的标记
          card.classList.remove('nsfw-blur');

          if (mode === 'only') {
            // “仅限”模式：隐藏非 NSFW，显示 NSFW
            card.style.display = isNsfw ? '' : 'none';
          } else if (!isNsfw) {
            // 非 NSFW 卡片在其它模式下始终显示
            card.style.display = '';
          } else {
            // NSFW 卡片：按策略处理
            if (mode === 'show') {
              card.style.display = '';
            } else if (mode === 'blur') {
              card.style.display = '';
              card.classList.add('nsfw-blur'); // CSS 负责模糊表现
            } else if (mode === 'hide') {
              card.style.display = 'none';
            }
          }
        });

        // 重新布局
        requestAnimationFrame(() => {
          layoutMasonry();
        });
      } catch (e) {
        console.error('applyNSFWPolicy error', e);
      }
    }


    return {
      showSkeleton,
      clearSkeleton,
      createCard,
      appendCardOrReplaceSkeleton,
      layoutMasonry,
      updateCategoryElement,
      showLoader,
      applyNSFWPolicy
    };
  })();

  // ================================================== 控制模块 ==================================================
  //负责所有用户交互事件绑定和UI控制

  const Controls = (() => {
    //初始化滑块控件
    function initSlider(sliderId, valueKey) {
      const container = document.getElementById(sliderId);
      if (!container) return;
      const thumb = container.querySelector('.slider-thumb');
      const options = container.querySelectorAll('.slider-option');
      const count = options.length;
      const optionWidth = 42; // 微调宽度以适应 4 个选项
      container.style.width = `${optionWidth * count}px`;

      function updateThumb(idx) {
        if (!thumb) return;
        const actualOptionWidth = container.clientWidth / count || optionWidth;
        thumb.style.width = `${Math.max(actualOptionWidth - 4, 8)}px`;
        thumb.style.left = `${actualOptionWidth * idx + 2}px`;
      }

      // 暴露给外部调用：首次显示或窗口 resize 时触发
      container._recalcThumb = () => {
        const idx = Array.from(options).findIndex(o => o.classList.contains('active'));
        if (idx !== -1) updateThumb(idx);
      };

      let savedValue = Settings.get(valueKey);
      if (savedValue === null && options[0]) savedValue = options[0].dataset.value;

      function updateUI(val) {
        const idx = Array.from(options).findIndex(o => o.dataset.value === String(val));
        if (idx === -1) return;
        options.forEach(opt => opt.classList.remove('active'));
        options[idx].classList.add('active');
        updateThumb(idx);
      }

      options.forEach(option => option.addEventListener('click', () => {
        const v = option.dataset.value;
        Settings.set(valueKey, v);
        updateUI(v);

        if (valueKey === 'nsfwMode') {
          UI.applyNSFWPolicy(Settings.get('nsfwMode'));
          UI.layoutMasonry();
          Toast.show(`已应用 NSFW 策略: ${v}`, 'info', 2000);
        }
        if (valueKey === 'columnCount') UI.layoutMasonry();
        if (valueKey === 'contentFilter') {
          // 内容筛选改变后，重新加载当前模式的内容
          App.refresh();
          Toast.show(`正在重新加载...`, 'info', 2000);
        }
      }));

      window.addEventListener('resize', () => container._recalcThumb && container._recalcThumb());

      updateUI(savedValue);
    }

    // 绑定设置模态框事件
    function bindSettingsModal() {
      const { SETTINGS_BTN, SETTINGS_MODAL, CLOSE_SETTINGS } = DOM;
      if (SETTINGS_BTN && SETTINGS_MODAL && CLOSE_SETTINGS) {
        SETTINGS_BTN.addEventListener('click', () => {
          SETTINGS_MODAL.classList.add('show');
          // 延迟调用 _recalcThumb，保证容器可见
          setTimeout(() => {
            document.querySelectorAll('.slider-container').forEach(c => {
              if (typeof c._recalcThumb === 'function') c._recalcThumb();
            });
          }, 80);
        });
        CLOSE_SETTINGS.addEventListener('click', () => SETTINGS_MODAL.classList.remove('show'));
        SETTINGS_MODAL.addEventListener('click', event => { 
          if (event.target === SETTINGS_MODAL) SETTINGS_MODAL.classList.remove('show'); 
        });
      }
    }

    //绑定用户ID输入框事件
    function bindUserIdInput() {
      const input = DOM.userIdInput;
      if (!input) return;
      const saved = Settings.get('userId');
      if (saved) input.value = saved;

      // 输入框失去焦点时验证并保存
      document.addEventListener('click', (e) => {
        if (!input.contains(e.target)) {
          const val = input.value.trim();
          if (/^\d*$/.test(val)) {
            localStorage.setItem('userId', val);
            if (val !== Settings.get('userId')) {
                Settings.set('userId', val);
                Toast.show('用户ID已保存', 'success', 2000);
            }
          } else {
            alert(Config.STRINGS.USERID_NOT_NUM);
            input.value = Settings.get('userId') || '';
          }
        }
      });
    }

    //绑定使用说明弹出框事件
    function bindHowToPopover() {
      const { howToBtn, howToPopover, howToPopoverArrow, closePopoverBtn } = DOM;
      if (!howToBtn || !howToPopover) return;

      //隐藏弹出框
      function hidePopover() {
        if (!howToPopover || howToPopover.classList.contains('hidden')) return;
        howToPopover.classList.add('hidden');
        howToPopover.style.left = '';
        howToPopover.style.top = '';
        howToPopover.style.visibility = '';
        howToPopover.style.position = '';
        if (howToPopoverArrow) {
          howToPopoverArrow.style.left = '';
          howToPopoverArrow.style.top = '';
          howToPopoverArrow.style.bottom = '';
          howToPopoverArrow.style.transform = '';
        }
      }

      //显示弹出框，自动计算位置以避免超出视口
      function showPopover() {
        if (!howToPopover || !howToBtn) return;
        if (!howToPopover.classList.contains('hidden')) {
          hidePopover();
          return;
        }

        howToPopover.classList.remove('hidden');
        howToPopover.style.position = 'fixed';
        howToPopover.style.visibility = 'hidden';
        howToPopover.style.left = '0px';
        howToPopover.style.top = '0px';

        const rect = howToBtn.getBoundingClientRect();
        const popW = howToPopover.offsetWidth;
        const popH = howToPopover.offsetHeight;
        const margin = 8;

        // 计算水平位置
        let left = rect.left + rect.width / 2 - popW / 2;
        if (left < margin) left = margin;
        if (left + popW > window.innerWidth - margin) left = window.innerWidth - margin - popW;

        // 计算垂直位置
        let top = rect.bottom + margin;
        let placeAbove = false;
        if (top + popH > window.innerHeight - margin) {
          top = rect.top - popH - margin;
          placeAbove = true;
        }

        // 计算箭头位置
        const arrowW = howToPopoverArrow?.offsetWidth || 14;
        let arrowLeft = rect.left + rect.width / 2 - left - arrowW / 2;
        const minArrowX = 12;
        const maxArrowX = popW - 12 - arrowW;
        if (arrowLeft < minArrowX) arrowLeft = minArrowX;
        if (arrowLeft > maxArrowX) arrowLeft = maxArrowX;

        howToPopover.style.left = Math.round(left) + 'px';
        howToPopover.style.top = Math.round(top) + 'px';

        // 设置箭头样式
        if (howToPopoverArrow) {
          if (placeAbove) {
            howToPopoverArrow.style.top = 'auto';
            howToPopoverArrow.style.bottom = '-7px';
            howToPopoverArrow.style.transform = 'rotate(225deg)';
          } else {
            howToPopoverArrow.style.top = '-7px';
            howToPopoverArrow.style.bottom = 'auto';
            howToPopoverArrow.style.transform = 'rotate(45deg)';
          }
          howToPopoverArrow.style.left = Math.round(arrowLeft) + 'px';
        }

        howToPopover.style.visibility = 'visible';
      }

      howToBtn.addEventListener('click', (e) => { e.stopPropagation(); showPopover(); });
      document.addEventListener('click', (e) => {
        if (!howToPopover.classList.contains('hidden') && !howToPopover.contains(e.target) && e.target !== howToBtn) hidePopover();
      });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hidePopover(); });
      if (closePopoverBtn) closePopoverBtn.addEventListener('click', hidePopover);
    }

    //绑定菜单事件
    function bindMenu() {
      const menuBtn = DOM.menuBtn;
      const menuList = DOM.menuList;
      const settingsModal = DOM.SETTINGS_MODAL;
      if (!menuBtn || !menuList) return;

      menuBtn.addEventListener('click', () => menuList.classList.toggle('show'));

      // 点击外部关闭菜单
      document.addEventListener('click', (e) => {
        if (!menuBtn.contains(e.target) && !menuList.contains(e.target)) menuList.classList.remove('show');
      });

      // 菜单项点击事件
      menuList.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', () => {
          const action = item.dataset.action;
          const text = item.textContent;

          // 订阅模式需要用户ID验证
          if (action === 'subscriptions' && !DOM.userIdInput.value.trim()) {
            Toast.show('请先设置用户ID以浏览订阅内容', 'error', 3000);
            settingsModal.classList.add('show');
            setTimeout(() => {
              if (!DOM.howToBtn || !DOM.howToPopover) return;
              const rect = DOM.howToBtn.getBoundingClientRect();
              DOM.howToPopover.style.top = rect.bottom + 8 + 'px';
              DOM.howToPopover.style.left = rect.left + 'px';
              DOM.howToPopover.classList.remove('hidden');
            }, 250);
            return;
          }

          App.setMode(action, text);
          Toast.show(`模式切换: ${text}`, 'info', 2000);
          menuList.classList.remove('show');
        });
      });
    }

    //绑定顶部导航栏和回到顶部按钮事件
    function bindTopbarAndBackTop() {
      // 滚动时隐藏/显示顶部导航栏
      let lastScroll = 0;
      window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;
        if (currentScroll > lastScroll) {
          DOM.topbar?.classList.add('hide');
        } else {
          DOM.topbar?.classList.remove('hide');
        }
        lastScroll = currentScroll <= 0 ? 0 : currentScroll;
      });

      // 回到顶部按钮显示/隐藏和点击事件
      window.addEventListener('scroll', () => { 
        if (DOM.BACK_TOP) DOM.BACK_TOP.style.opacity = window.scrollY > 420 ? '1' : '0'; 
      });
      if (DOM.BACK_TOP) DOM.BACK_TOP.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }

    //绑定窗口调整大小事件
    function bindResizeLayout() {
      let resizeTimer = null;
      let lastWindowSize = { w: window.innerWidth, h: window.innerHeight };

      //处理窗口调整大小，使用防抖避免频繁布局计算
      function handleResize() {
        UI.layoutMasonry();
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          const current = { w: window.innerWidth, h: window.innerHeight };
          if (current.w !== lastWindowSize.w || current.h !== lastWindowSize.h) {
            lastWindowSize = current;
            UI.layoutMasonry();
          } else {
            resizeTimer = null;
          }
        }, 1000);
      }

      window.addEventListener('resize', handleResize);
    }

    //初始化所有滑块控件
    function initSliders() {
      initSlider('thumbQualitySlider', 'thumbQuality');
      initSlider('columnCountSlider', 'columnCount');
      initSlider('contentFilterSlider', 'contentFilter');
      initSlider('nsfwSlider', 'nsfwMode');

    }

    //初始化所有控件
    function initAll() {
      bindSettingsModal();
      bindUserIdInput();
      bindHowToPopover();
      bindMenu();
      bindTopbarAndBackTop();
      bindResizeLayout();
      initSliders();
    }

    return { initAll };
  })();

  // ================================================== 数据加载模块 ==================================================
  //主应用模块，负责数据加载、分页管理、无限滚动和错误处理

  const App = (() => {
    let page = 1; // 当前页码
    let loading = false; // 是否正在加载
    let noMore = false; // 是否没有更多数据
    let currentMode = Config.DEFAULT_MODE; // 当前显示模式
    const skeletonCount = Config.INITIAL_SKELETON_COUNT; // 骨架屏数量

    // 无限滚动观察器
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !noMore) loadThreePages();
      });
    }, { rootMargin: Config.SCROLL_ROOT_MARGIN });

    //设置显示模式
    function setMode(mode, text = '') {
      currentMode = mode;
      page = 1;
      noMore = false;
      DOM.MODS_CONTAINER.innerHTML = '';
      if (DOM.menuBtn && text) DOM.menuBtn.textContent = text + ' ▼';
      loadThreePages(true);
    }

    // 刷新当前模式
    function refresh() {
      page = 1;
      noMore = false;
      DOM.MODS_CONTAINER.innerHTML = '';
      loadThreePages(true);
    }

    //格式化时间戳为相对时间或日期
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

    // 核心函数：获取并渲染一页数据
    async function loadMods() {
      if (loading || noMore) return;
      loading = true;
      DOM.LOADER && (DOM.LOADER.style.display = 'block');

      const skeletons = UI.showSkeleton(skeletonCount);

      try {
        const quality = Settings.get('thumbQuality') || Config.DEFAULT_THUMB_QUALITY;
        const filter = Settings.get('contentFilter') || 'all';
        const url = Api.getApiUrl(currentMode, page);
        if (!url) {
            Toast.show('无效的 API 地址或缺少 userId', 'error', 3000);
            throw new Error('无效的 API 地址或缺少 userId（订阅模式）');
        }

        const response = await fetch(url);
        if (!response.ok) throw new Error('网络错误');

        const data = await response.json();
        const records = data?._aRecords || [];

        // 检查是否还有更多数据
        if (!Array.isArray(records) || records.length === 0) {
          noMore = true;
          UI.clearSkeleton();
          DOM.LOADER && (DOM.LOADER.textContent = Config.STRINGS.NO_MORE);
          loading = false;
          return;
        }

        const items = [];
        const categoryIdsToFetch = [];
        
        // 允许的模型类型
        const allowedModels = ['Mod', 'Tool', 'Question', 'Thread', 'Request'];

        // 处理每条记录
        for (const r of records) {
          let source = r;
          if (currentMode === 'subscriptions' && r._aSubscription) source = r._aSubscription;

          const model = source?._sModelName;
          
          // 如果不是"全部"筛选且不在允许列表中，则跳过
          if (filter !== 'all' && !allowedModels.includes(model)) continue;
          // 在全部模式下，如果返回了一些我们没定义样式的模型，也要有个基本的白名单避免异常数据
          if (filter === 'all' && !model) continue;

          const item_id = source?._idRow;
          let cat_name = null;
          let cat_id = null;

          // 处理动态分类信息和元数据展示
          if (model === 'Mod' || model === 'Tool') {
            cat_name = Config.STRINGS.GETTING;
            categoryIdsToFetch.push(item_id);
          } else if (model === 'Request') {
            const bounty = source._nBounty ? `赏金: ${source._nBounty}` : '';
            const status = source._sResolution === 'Open' ? '进行中' : '已解决';
            cat_name = bounty ? `${bounty} | ${status}` : status;
          } else if (model === 'Question') {
            cat_name = source._sState === 'Answered' ? '✅ 已回答' : '❓ 待解决';
          } else if (model === 'Thread') {
            cat_name = `${source._nPostCount || 0} 条回复`;
          } else {
            // "全部" 模式下其他模型的 fallback
            cat_name = model || '其他内容';
          }

          // 处理缩略图
          let thumb = null;
          try {
            const img = source?._aPreviewMedia?._aImages?.[0];
            if (img) {
              let base = (img._sBaseUrl || '').replace(/\/$/, '');
              let file = null;

              // 根据用户设置选择缩略图质量
              switch (quality) {
                case '220': file = img._sFile220; break;
                case '530': file = img._sFile530; break;
                default: file = img._sFile530; break; // 默认530
              }

              // 回退策略：如果目标质量不存在，选择可用的质量
              if (!file) {
                file = img._sFile530 || img._sFile220 || img._sFile800 || img._sFile100 || img._sFile;
              }

              if (base && file) {
                if (!base.startsWith('http')) base = 'https://' + base.replace(/^\/+/, '');
                thumb = base + '/' + file;
              }
            }

          } catch (e) { }

          items.push({
            id: item_id,
            model,
            name: source?._sName,
            author: source?._aSubmitter?._sName,
            author_url: source?._aSubmitter?._sProfileUrl,
            thumb,
            // 修正：支持从嵌套路径提取摘要，优先读取根部，若无则尝试 _aPreviewMedia._aMetadata
            snippet: source?._sSnippet || source?._aPreviewMedia?._aMetadata?._sSnippet,
            category: cat_name,
            catid: source?._aRootCategory?._idRow,
            date_added: formatTime(source?._tsDateAdded),
            likes: source?._nLikeCount || 0,
            views: source?._nViewCount || 0,
            nsfw: !!source?._bHasContentRatings
          });
        }

        // 翻译数据
        const translatedItems = Translator.isLoaded() ? Translator.translateContent(items) : items;

        // 创建并添加卡片
        translatedItems.forEach((item, index) => {
          const card = UI.createCard(item);
          UI.appendCardOrReplaceSkeleton(card, skeletons, index);
        });

        UI.layoutMasonry();

        // 渲染完成后应用 NSFW 策略
        (function applyNsfwPolicyAfterRender() {
          const nsfwMode = Settings.get('nsfwMode') || 'show';
          UI.applyNSFWPolicy(nsfwMode);
        })();

        // 处理分类信息获取
        if (categoryIdsToFetch.length) {
          categoryIdsToFetch.forEach(id => CategoryPoller.add(id));
        }

        loading = false;
      } catch (error) {
        // 错误处理
        UI.clearSkeleton();
        DOM.LOADER && (DOM.LOADER.textContent = Config.STRINGS.LOADING_FAILED);
        console.error(error);
        Toast.show('数据加载失败，请检查网络', 'error', 3000);
        loading = false;
      } finally {
        DOM.LOADER && (DOM.LOADER.style.display = noMore ? 'block' : 'none');
      }
    }

    //加载多页数据的辅助函数
    async function loadThreePages(isInitial = false) {
      for (let i = 0; i < 3; i++) {
        if (!isInitial) page++;
        await loadMods();
        isInitial = false;
        if (noMore) break;
      }
    }

    async function initializeApp() {
      try {
        console.log('🚀 开始初始化应用...');
        
        // 1. 加载设置
        Settings.load();
        
        // 2. 初始化控件（不依赖其他模块）
        Controls.initAll();
        
        // 3. 先加载翻译表（必须最先完成）
        await Translator.loadTranslationTable();
        console.log('✅ 翻译表加载完成');
        
        // 4. 然后加载分类缓存
        await CategoryPoller.loadCategoryCache();
        console.log('✅ 分类缓存加载完成');
        
        // 5. 初始化无限滚动观察器
        if (DOM.SENTINEL) {
          observer.observe(DOM.SENTINEL);
        }
        
        // 6. 最后开始加载Mod数据（确保翻译表已就绪）
        await loadThreePages(true);
        
        Toast.show('欢迎回来！数据已就绪', 'success', 2500);
        console.log('🎉 应用初始化完成');
        
      } catch (error) {
        console.error('❌ 初始化失败:', error);
        UI.showLoader(true, '初始化失败，请刷新页面');
        Toast.show('应用初始化异常', 'error', 5000);
      }
    }
    return { initializeApp, setMode, refresh };
  })();

  // ================================================== 初始化 ==================================================
  //DOM加载完成后初始化设置和主应用
  
  document.addEventListener('DOMContentLoaded', () => {
    App.initializeApp(); // 通过 App 模块调用
  });

})();
