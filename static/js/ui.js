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
    const detailUrl = `/mod/api/id/${item.id}`;
    
    if (item.thumb) {
      thumbHtml = `<a class="thumb" href="${detailUrl}" target="_self">
           <img loading="lazy" src="${escapeAttr(item.thumb)}" alt="${escapeHtml(item.name || '')}">
         </a>`;
    } else if (item.snippet) {
      thumbHtml = `<a class="thumb snippet-thumb" href="${detailUrl}" target="_self">
           <div class="snippet-text">${escapeHtml(item.snippet)}</div>
         </a>`;
    } else {
      thumbHtml = `<div class="thumb no-img"><span>无图</span></div>`;
    }

    const titleHtml = `
      <h3 class="title">
          <a href="${detailUrl}" target="_self">
              ${escapeHtml(item.name || '（无标题）')}
          </a>
      </h3>
    `;

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
                  ${item.has_update ? `<br>更新: ${escapeHtml(item.date_modified)}` : ''}
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

    if (item.model === 'Mod' && categoryClass === 'pending') {
      CategoryPoller.add(item.id);
    }

    return card;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    return String(str)
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function updateCategoryElement(id, info) {
    const selector = `.mod-card .category[data-id="${id}"], .card .category[data-id="${id}"]`;
    const el = document.querySelector(selector);
    if (!el) return;

    if (info?.category) {
      el.textContent = info.category;
      el.dataset.status = 'done';
      el.classList.remove('pending');
      if (info.catid) el.href = `https://gamebanana.com/mods/cats/${info.catid}`;
    } else {
      el.textContent = Config.STRINGS.UNKNOWN;
      el.dataset.status = 'done';
      el.classList.remove('pending');
    }
    el.style.display = '';
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
    
    if (isModeSwitch) {
      container.classList.add('layout-changing');
    }

    const cards = Array.from(container.children).filter(c => c.style.display !== 'none');
    const gap = parseInt(getComputedStyle(container).getPropertyValue('--gap')) || 16;

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
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          container.classList.remove('layout-changing');
        });
      });
    }
  }

  function appendCardOrReplaceSkeleton(card, skeletons, index) {
    const skeleton = skeletons && skeletons[index];
    if (skeleton && skeleton.isConnected) {
      skeleton.replaceWith(card);
    } else {
      container.appendChild(card);
    }
  }

  function showLoader(show, text) {
    if (!loader) return;
    loader.style.display = show ? 'block' : 'none';
    if (text) loader.textContent = text;
  }

  function applyNSFWPolicy(mode = 'hide') {
    try {
      const cards = Array.from(container.querySelectorAll('.mod-card'));
      cards.forEach(card => {
        const isNsfw = card.dataset.nsfw === 'true';
        card.classList.remove('nsfw-blur');

        if (mode === 'only') {
          card.style.display = isNsfw ? '' : 'none';
        } else if (!isNsfw) {
          card.style.display = '';
        } else {
          if (mode === 'show') {
            card.style.display = '';
          } else if (mode === 'blur') {
            card.style.display = '';
            card.classList.add('nsfw-blur');
          } else if (mode === 'hide') {
            card.style.display = 'none';
          }
        }
      });

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