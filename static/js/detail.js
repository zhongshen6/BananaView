/* 每次修改后修改次数加一，并另起一行写下这次的修改内容*/
/* 第2次修改，分离代码 */
/* 第3次修改，增加文件元数据展示（时间、下载量、MD5） */
/* 第4次修改，彻底重构为 DOM 元素池方案，物理意义上消除重复请求，支持背景 Cross-fade 效果 */
/* 第5次修改，将背景层也升级为 DOM 图片池，通过切换物理节点彻底消除切换背景时的任何网络验证请求 */
/* 第6次修改，增加缩略图自动居中滚动逻辑，确保激活项始终在视口中心 */
/* 第7次修改，转向 ES6 Modules (ESM) */
/* 第8次修改,重构为spa*/
/* 第9次修改,解决直接访问id时无法正常打开问题，并移除冗余独立加载逻辑 */
/* 第10次修改,合并原 detail.html 中的所有缺失板块渲染逻辑（许可证、作者简介、使用软件） */
/* 第11次修改,支持动态获取不同类型(Mod/Thread/Question等)的详情数据，增加数据结构容错 */

import { Translator } from './translator.js';
import { DOM } from './config.js';

/**
 * 详情页模块 (SPA 适配版)
 */

function formatDate(ts) {
    if (!ts) return "未知";
    const d = new Date(ts * 1000);
    return d.toLocaleDateString();
}

function formatSize(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

const GalleryManager = (() => {
    let currentIdx = -1;
    let imageElements = [];
    let bgElements = [];

    function setupPool(images) {
        const mainContainer = document.getElementById('mainImgContainer');
        const bgContainer = document.getElementById('heroBg');
        if (!mainContainer || !bgContainer) return;

        mainContainer.innerHTML = ''; bgContainer.innerHTML = '';
        imageElements = []; bgElements = [];
        currentIdx = -1; 

        images.forEach((imgData, idx) => {
            const fullUrl = imgData._sBaseUrl && imgData._sFile ? `${imgData._sBaseUrl}/${imgData._sFile}` : null;
            if (!fullUrl) return;

            const img = document.createElement('img');
            img.className = 'pool-image';
            img.src = fullUrl;
            img.loading = idx === 0 ? "eager" : "lazy";
            
            const bgImg = document.createElement('img');
            bgImg.className = 'bg-pool-image';
            bgImg.src = fullUrl;
            bgImg.loading = "lazy";
            
            mainContainer.appendChild(img);
            bgContainer.appendChild(bgImg);
            imageElements.push(img);
            bgElements.push(bgImg);
        });
    }

    function switchImage(idx, thumbElement) {
        if (idx === currentIdx || !imageElements[idx]) return;
        document.querySelectorAll('.thumb-item').forEach(t => t.classList.remove('active'));
        if (thumbElement) {
            thumbElement.classList.add('active');
            thumbElement.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
        imageElements.forEach((el, i) => el.classList.toggle('active', i === idx));
        bgElements.forEach((el, i) => el.classList.toggle('active', i === idx));
        currentIdx = idx;
    }

    return { setupPool, switchImage };
})();

function render(data) {
    const name = Translator.translateModName(data._sName);
    const modNameEl = document.getElementById('modName');
    if (modNameEl) modNameEl.textContent = name;
    
    const addDateEl = document.getElementById('addDate');
    if (addDateEl) addDateEl.textContent = formatDate(data._tsDateAdded);
    
    const viewCountEl = document.getElementById('viewCount');
    if (viewCountEl) viewCountEl.textContent = data._nViewCount || 0;
    
    const likeCountEl = document.getElementById('likeCount');
    if (likeCountEl) likeCountEl.textContent = data._nLikeCount || 0;
    
    const dlCountEl = document.getElementById('dlCount');
    if (dlCountEl) dlCountEl.textContent = data._nDownloadCount || 0;
    
    const modDescEl = document.getElementById('modDescription');
    if (modDescEl) modDescEl.innerHTML = data._sText || data._sDescription || "无描述";
    
    const downloadBtnEl = document.getElementById('mainDownloadBtn');
    if (downloadBtnEl) downloadBtnEl.href = data._sDownloadUrl || data._sProfileUrl;

    const images = data._aPreviewMedia?._aImages;
    const thumbList = document.getElementById('thumbList');
    const gallerySection = document.querySelector('.gallery-section');

    if (thumbList) {
        thumbList.innerHTML = '';
        if (images && images.length > 0) {
            if (gallerySection) gallerySection.style.display = 'flex';
            GalleryManager.setupPool(images);
            images.forEach((img, idx) => {
                const thumbUrl = img._sFile100 ? `${img._sBaseUrl}/${img._sFile100}` : `${img._sBaseUrl}/${img._sFile}`;
                const thumb = document.createElement('div');
                thumb.className = `thumb-item ${idx === 0 ? 'active' : ''}`;
                thumb.innerHTML = `<img src="${thumbUrl}">`;
                thumb.onclick = () => GalleryManager.switchImage(idx, thumb);
                thumbList.appendChild(thumb);
                if (idx === 0) GalleryManager.switchImage(0, thumb);
            });
        } else {
            // 没有图片时隐藏画廊
            if (gallerySection) gallerySection.style.display = 'none';
        }
    }

    const reqSection = document.getElementById('reqSection');
    const reqList = document.getElementById('reqList');
    if (reqSection && reqList) {
        reqList.innerHTML = '';
        if (data._aRequirements && data._aRequirements.length > 0) {
            reqSection.style.display = 'block';
            data._aRequirements.forEach(req => {
                const a = document.createElement('a');
                a.className = 'req-item'; a.href = req[1] || '#'; a.target = '_blank'; a.textContent = req[0];
                reqList.appendChild(a);
            });
        } else { reqSection.style.display = 'none'; }
    }

    const fileList = document.getElementById('fileList');
    if (fileList) {
        fileList.innerHTML = '';
        if (data._aFiles && data._aFiles.length > 0) {
            data._aFiles.forEach(f => {
                const div = document.createElement('div');
                div.className = 'file-item';
                div.innerHTML = `
                    <div style="flex:1; min-width:0;">
                        <div style="font-weight:600; font-size:0.85rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${f._sFile}</div>
                        <div class="file-meta">
                            <span>📅 ${formatDate(f._tsDateAdded)}</span>
                            <span>📥 ${f._nDownloadCount || 0}</span>
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:0.8rem; font-weight:600;">${formatSize(f._nFilesize)}</div>
                        <a href="https://gamebanana.com/dl/${f._idRow}" class="inline-download-btn" target="_blank">下载</a>
                    </div>
                `;
                fileList.appendChild(div);
            });
        }
    }

    // 渲染发布者信息
    const sub = data._aSubmitter;
    if (sub) {
        const authorNameEl = document.getElementById('authorName');
        if (authorNameEl) {
            authorNameEl.textContent = sub._sName;
            authorNameEl.href = sub._sProfileUrl;
        }
        const authorAvatarEl = document.getElementById('authorAvatar');
        if (authorAvatarEl) authorAvatarEl.src = sub._sAvatarUrl || 'https://images.gamebanana.com/img/av/default.png';
        
        const authorTitleEl = document.getElementById('authorTitle');
        if (authorTitleEl) authorTitleEl.textContent = sub._sUserTitle || '';
        
        const wall = document.getElementById('medalsWall');
        if (wall) {
            wall.innerHTML = '';
            const allMedals = [...(sub._aNormalMedals || []), ...(sub._aRareMedals || [])];
            allMedals.slice(0, 10).forEach(m => {
                const img = document.createElement('img');
                img.className = 'medal-icon'; img.src = `https://images.gamebanana.com/img/ico/medals/${m[0]}`; img.title = m[1];
                wall.appendChild(img);
            });
        }

        // 渲染作者简介 (Bio)
        const bioSection = document.getElementById('bioSection');
        const authorBioEl = document.getElementById('authorBio');
        if (bioSection && authorBioEl) {
            if (sub._sBio) {
                bioSection.style.display = 'block';
                authorBioEl.innerHTML = sub._sBio;
            } else {
                bioSection.style.display = 'none';
            }
        }
    }

    // 渲染许可证
    const licenseSection = document.getElementById('licenseSection');
    const licenseInfoEl = document.getElementById('licenseInfo');
    if (licenseSection && licenseInfoEl) {
        if (data._sLicense) {
            licenseSection.style.display = 'block';
            licenseInfoEl.innerHTML = data._sLicense;
        } else {
            licenseSection.style.display = 'none';
        }
    }

    // 渲染使用软件 (Software)
    const softwareSection = document.getElementById('softwareSection');
    const softwareTagsEl = document.getElementById('softwareTags');
    if (softwareSection && softwareTagsEl) {
        softwareTagsEl.innerHTML = '';
        if (data._aSoftwareUsed && data._aSoftwareUsed.length > 0) {
            softwareSection.style.display = 'block';
            data._aSoftwareUsed.forEach(sw => {
                const pill = document.createElement('span');
                pill.className = 'tag-pill';
                pill.textContent = sw._sName || sw;
                softwareTagsEl.appendChild(pill);
            });
        } else {
            softwareSection.style.display = 'none';
        }
    }

    // 渲染游戏信息
    if (data._aGame) {
        const gameNameEl = document.getElementById('gameName');
        if (gameNameEl) gameNameEl.textContent = data._aGame._sName;
        const gameIconEl = document.getElementById('gameIcon');
        if (gameIconEl) gameIconEl.src = data._aGame._sIconUrl;
    }
}

export async function loadDetail(id, model = 'Mod') {
    const detailLoading = DOM.detailLoading || document.getElementById('detailLoading');
    const detailMainContent = DOM.detailMainContent || document.getElementById('detailMainContent');
    
    if (detailLoading) detailLoading.classList.remove('hidden');
    if (detailMainContent) detailMainContent.style.display = 'none';

    try {
        if (!Translator.isLoaded()) {
            await Translator.loadTranslationTable('/mod/');
        }

        // 动态构建 API 路径，支持 Mod, Thread, Question, Request 等
        const response = await fetch(`https://gamebanana.com/apiv11/${model}/${id}/ProfilePage`);
        if (!response.ok) throw new Error('API Error');
        const data = await response.json();
        render(data);
        if (detailMainContent) detailMainContent.style.display = 'block';
    } catch (err) {
        console.error('加载详情失败:', err);
    } finally {
        if (detailLoading) detailLoading.classList.add('hidden');
    }
}
