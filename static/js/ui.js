import { DOM, Config } from './config.js';
import { CategoryPoller } from './poller.js';

export const UI = (() => {
  const container = DOM.MODS_CONTAINER;
  const loader = DOM.LOADER;
  let prevColumnCount = -1;

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
    layoutMasonry();
    return Array.from(container.children).slice(-count);
  }

  function clearSkeleton() {
    container.querySelectorAll('.card.skeleton').forEach(el => el.remove());
    layoutMasonry();
  }

  function createCard(item) {
    const card = document.createElement('article');
    const modelLower = item.model.toLowerCase();
    card.className = `card mod-card type-${modelLower}`;
    card.dataset.id = item.id;
    card.dataset.nsfw = item.nsfw ? 'true' : 'false';

    let tagHtml = '';
    if (item.model === 'Mod' || item.model === 'Tool') {
      tagHtml = item.nsfw ? `<span class="nsfw-tag">NSFW</span>` : `<span class="sfw-tag">SFW</span>`;
    } else {
      const labels = { 'Question': '💡 问题', 'Request': '💰 悬赏', 'Thread': '💬 讨论' };
      tagHtml = `<span class="type-tag">${labels[item.model] || item.model}</span>`;
    }

    let thumbHtml = '';
    
    if (item.thumb) {
      thumbHtml = `<div class="thumb" data-id="${item.id}">
           <img loading="lazy" src="${escapeAttr(item.thumb)}" alt="${escapeHtml(item.name || '')}">
         </div>`;
    } else if (item.snippet) {
      thumbHtml = `<div class="thumb snippet-thumb" data-id="${item.id}">
           <div class="snippet-text">${escapeHtml(item.snippet)}</div>
         </div>`;
    } else {
      thumbHtml = `<div class="thumb no-img" data-id="${item.id}"><span>无图</span></div>`;
    }

    const titleHtml = `
      <h3 class="title" data-id="${item.id}">
          ${escapeHtml(item.name || '（无标题）')}
      </h3>
    `;

    // --- 分类渲染逻辑优化 ---
    // 1. 尝试从 CategoryPoller 获取缓存信息
    const cachedInfo = CategoryPoller.getCategoryInfo(item.id);
    
    // 2. 确定初始显示的文本和样式
    let categoryText = Config.STRINGS.GETTING;
    let categoryClass = 'pending';
    let categoryId = null;

    if (item.model !== 'Mod') {
        // 非 Mod 类型直接显示模型名称
        categoryText = item.model;
        categoryClass = '';
    } else if (cachedInfo) {
        // Mod 类型且有缓存
        categoryText = cachedInfo.category;
        categoryId = cachedInfo.catid;
        categoryClass = '';
    } else if (item.category && item.category !== Config.STRINGS.GETTING) {
        // 传入数据中已有分类（通常是 API 响应带过来的）
        categoryText = item.category;
        categoryClass = '';
    }

    let categoryHref = categoryId || item.catid ? `https://gamebanana.com/${modelLower}s/cats/${categoryId || item.catid}` : '#';

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
                         target="_blank"
                         data-id="${item.id}">
                          ${escapeHtml(categoryText)}
                      </a>
                  </div>
              </div>
              <div class="statsMini">
                  👍${escapeHtml(String(item.likes || 0))} &nbsp; 👁️${escapeHtml(String(item.views || 0))}
              </div>
          </div>                  
      </div>
    `;

    card.innerHTML = `${tagHtml}${thumbHtml}${titleHtml}${bodyHtml}`;

    // 绑定卡片点击到 SPA 详情
    card.addEventListener('click', (e) => {
        if (e.target.tagName === 'A') return;
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('open-detail', { detail: { id: item.id } }));
    });

    const image = card.querySelector('.thumb img');
    if (image) image.onload = () => requestAnimationFrame(layoutMasonry);

    // 只有当它是 Mod 且没有分类数据时才加入轮询
    if (item.model === 'Mod' && categoryClass === 'pending') {
      CategoryPoller.add(item.id);
    }

    return card;
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function updateCategoryElement(id, info) {
    const selector = `.mod-card .category[data-id="${id}"], .card .category[data-id="${id}"]`;
    const el = document.querySelector(selector);
    if (!el) return;
    if (info?.category) {
      el.textContent = info.category;
      el.classList.remove('pending');
      // 如果有 catid，同步更新链接
      if (info.catid) {
          el.href = `https://gamebanana.com/mods/cats/${info.catid}`;
      }
    }
  }

  function getColumnCount() {
    const userColumns = parseInt(window.localStorage.getItem('mods_settings_v1') ? JSON.parse(window.localStorage.getItem('mods_settings_v1')).columnCount : 0);
    if (userColumns === 1) return 1;
    const width = container.clientWidth;
    if (width <= Config.DEFAULT_COLUMN_BREAKPOINTS.sm) return 2;
    if (width <= Config.DEFAULT_COLUMN_BREAKPOINTS.md) return 3;
    return 4;
  }

  function layoutMasonry() {
    const columnCount = getColumnCount();
    const isModeSwitch = (prevColumnCount !== -1 && ((prevColumnCount === 1 && columnCount > 1) || (prevColumnCount > 1 && columnCount === 1)));
    
    if (isModeSwitch) container.classList.add('layout-changing');

    const cards = Array.from(container.children).filter(c => c.style.display !== 'none');
    const gap = 16;

    if (columnCount === 1) {
      cards.forEach(card => {
        card.style.position = ''; card.style.top = ''; card.style.left = ''; card.style.transform = ''; card.style.width = '';
        card.classList.add('horizontal'); card.classList.add('rendered');
      });
      container.style.height = 'auto';
    } else {
      const columnWidth = (container.clientWidth - gap * (columnCount - 1)) / columnCount;
      const columnHeights = Array(columnCount).fill(0);

      cards.forEach(card => {
        card.classList.remove('horizontal');
        card.style.width = `${columnWidth}px`;
        card.style.position = 'absolute';
        const minColumnIndex = columnHeights.indexOf(Math.min(...columnHeights));
        const x = Math.round((columnWidth + gap) * minColumnIndex);
        const y = Math.round(columnHeights[minColumnIndex]);
        card.style.transform = `translate(${x}px, ${y}px)`;
        columnHeights[minColumnIndex] += card.offsetHeight + gap;
        card.classList.add('rendered');
      });
      container.style.height = `${Math.max(...columnHeights) || 0}px`;
    }
    prevColumnCount = columnCount;
    if (isModeSwitch) {
      requestAnimationFrame(() => requestAnimationFrame(() => container.classList.remove('layout-changing')));
    }
  }

  function appendCardOrReplaceSkeleton(card, skeletons, index) {
    const skeleton = skeletons && skeletons[index];
    if (skeleton && skeleton.isConnected) skeleton.replaceWith(card);
    else container.appendChild(card);
  }

  function showLoader(show, text) {
    if (!loader) return;
    loader.style.display = show ? 'block' : 'none';
    if (text) loader.textContent = text;
  }

  function applyNSFWPolicy(mode = 'hide') {
    const cards = Array.from(container.querySelectorAll('.mod-card'));
    cards.forEach(card => {
      const isNsfw = card.dataset.nsfw === 'true';
      card.classList.remove('nsfw-blur');
      if (mode === 'only') card.style.display = isNsfw ? '' : 'none';
      else if (!isNsfw) card.style.display = '';
      else {
        if (mode === 'show') card.style.display = '';
        else if (mode === 'blur') { card.style.display = ''; card.classList.add('nsfw-blur'); }
        else card.style.display = 'none';
      }
    });
    requestAnimationFrame(layoutMasonry);
  }

  return { showSkeleton, clearSkeleton, createCard, appendCardOrReplaceSkeleton, layoutMasonry, updateCategoryElement, showLoader, applyNSFWPolicy };
})();