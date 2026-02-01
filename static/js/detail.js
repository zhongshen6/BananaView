/* 每次修改后修改次数加一，并另起一行写下这次的修改内容*/
/* 第2次修改，分离代码 */
/* 第3次修改，增加文件元数据展示（时间、下载量、MD5） */
/* 第4次修改，彻底重构为 DOM 元素池方案，物理意义上消除重复请求，支持背景 Cross-fade 效果 */
/* 第5次修改，将背景层也升级为 DOM 图片池，通过切换物理节点彻底消除切换背景时的任何网络验证请求 */
/* 第6次修改，增加缩略图自动居中滚动逻辑，确保激活项始终在视口中心 */
/* 第7次修改，转向 ES6 Modules (ESM) */


import { Translator } from './translator.js';

/**
 * BananaView 详情页逻辑模块 (ES 模块版本)
 */

// 自动重定向逻辑
(function() {
    const pathParts = window.location.pathname.split('/');
    const modId = pathParts.pop();
    if (!modId || isNaN(modId) || modId === 'detail.html') {
        window.location.href = '/mod/';
    }
})();

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

/**
 * 画廊管理模块 (基于双重 DOM 元素池：主图池 + 背景池)
 */
const GalleryManager = (() => {
    let currentIdx = -1;
    let imageElements = []; // 主图池 <img>
    let bgElements = [];    // 背景池 <img>

    /**
     * 为每一张画廊图片预创建主图和背景 DOM 节点
     */
    function setupPool(images) {
        const mainContainer = document.getElementById('mainImgContainer');
        const bgContainer = document.getElementById('heroBg');
        
        mainContainer.innerHTML = ''; 
        bgContainer.innerHTML = '';
        imageElements = [];
        bgElements = [];

        images.forEach((imgData, idx) => {
            const fullUrl = `${imgData._sBaseUrl}/${imgData._sFile}`;
            
            // 1. 创建主图节点
            const img = document.createElement('img');
            img.className = 'pool-image';
            img.src = fullUrl;
            img.loading = (idx === 0) ? "eager" : "lazy"; 
            img.alt = `Preview ${idx}`;
            
            // 2. 创建背景节点 (物理隔离 URL 赋值操作)
            const bgImg = document.createElement('img');
            bgImg.className = 'bg-pool-image';
            bgImg.src = fullUrl;
            bgImg.loading = "lazy"; // 背景稍后加载即可

            // 初始加载动画逻辑
            if (idx === 0) {
                mainContainer.classList.add('is-loading');
                img.onload = () => mainContainer.classList.remove('is-loading');
            }

            mainContainer.appendChild(img);
            bgContainer.appendChild(bgImg);
            
            imageElements.push(img);
            bgElements.push(bgImg);
        });
    }

    /**
     * 切换图片 (物理意义上的节点显隐切换，完全跳过 src 赋值)
     */
    function switchImage(idx, thumbElement) {
        if (idx === currentIdx || !imageElements[idx]) return;

        // 1. 更新缩略图状态并自动居中滚动
        document.querySelectorAll('.thumb-item').forEach(t => t.classList.remove('active'));
        if (thumbElement) {
            thumbElement.classList.add('active');
            // 核心改进：平滑滚动到视野中心
            thumbElement.scrollIntoView({ 
                behavior: 'smooth', 
                inline: 'center', 
                block: 'nearest' 
            });
        }

        // 2. 切换主图堆栈
        imageElements.forEach((el, i) => {
            el.classList.toggle('active', i === idx);
        });

        // 3. 切换背景堆栈 (物理节点透明度切换，实现零请求 Cross-fade)
        bgElements.forEach((el, i) => {
            el.classList.toggle('active', i === idx);
        });

        currentIdx = idx;
    }

    return { setupPool, switchImage };
})();

/**
 * 渲染页面内容
 */
function render(data) {
    const name = Translator.translateModName(data._sName);
    document.getElementById('modName').textContent = name;
    document.title = name + " - BananaView";

    document.getElementById('addDate').textContent = formatDate(data._tsDateAdded);
    document.getElementById('viewCount').textContent = data._nViewCount || 0;
    document.getElementById('likeCount').textContent = data._nLikeCount || 0;
    document.getElementById('dlCount').textContent = data._nDownloadCount || 0;
    document.getElementById('modDescription').innerHTML = data._sText || data._sDescription || "无描述";
    document.getElementById('mainDownloadBtn').href = data._sDownloadUrl;

    if (data._sLicense) {
        document.getElementById('licenseSection').style.display = 'block';
        document.getElementById('licenseInfo').innerHTML = data._sLicense;
    }

    // 画廊初始化
    const images = data._aPreviewMedia?._aImages;
    const thumbList = document.getElementById('thumbList');

    if (images && images.length > 0 && thumbList) {
        // 创建双重 DOM 池
        GalleryManager.setupPool(images);

        // 创建缩略图
        images.forEach((img, idx) => {
            const thumbUrl = img._sFile100 ? `${img._sBaseUrl}/${img._sFile100}` : 
                           (img._sFile220 ? `${img._sBaseUrl}/${img._sFile220}` : `${img._sBaseUrl}/${img._sFile}`);
            
            const thumb = document.createElement('div');
            thumb.className = `thumb-item ${idx === 0 ? 'active' : ''}`;
            thumb.innerHTML = `<img src="${thumbUrl}">`;
            thumb.onclick = () => GalleryManager.switchImage(idx, thumb);
            thumbList.appendChild(thumb);

            // 首次应用显示
            if (idx === 0) GalleryManager.switchImage(0, thumb);
        });
    }

    // 前置要求渲染
    if (data._aRequirements && data._aRequirements.length > 0) {
        const reqSection = document.getElementById('reqSection');
        const reqList = document.getElementById('reqList');
        reqSection.style.display = 'block';
        data._aRequirements.forEach(req => {
            const a = document.createElement('a');
            a.className = 'req-item';
            a.href = req[1] || '#';
            a.target = '_blank';
            a.textContent = req[0];
            reqList.appendChild(a);
        });
    }

    // 文件列表渲染
    const fileList = document.getElementById('fileList');
    if (fileList && data._aFiles) {
        data._aFiles.forEach(f => {
            const div = document.createElement('div');
            div.className = 'file-item';
            const downloadUrl = `https://gamebanana.com/dl/${f._idRow}`;
            div.innerHTML = `
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:600; font-size:0.85rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${f._sFile}</div>
                    <div style="font-size:0.7rem; color:var(--muted);">${f._sDescription || '无说明'}</div>
                    <div class="file-meta">
                        <span>📅 ${formatDate(f._tsDateAdded)}</span>
                        <span>📥 ${f._nDownloadCount || 0}</span>
                        <span class="md5-span">🔑 <code>${f._sMd5Checksum || 'N/A'}</code></span>
                    </div>
                </div>
                <div style="text-align:right; flex-shrink:0;">
                    <div style="font-size:0.8rem; font-weight:600;">${formatSize(f._nFilesize)}</div>
                    <a href="${downloadUrl}" class="inline-download-btn">直接下载</a>
                </div>
            `;
            fileList.appendChild(div);
        });
    }

    // 发布者信息渲染
    const sub = data._aSubmitter;
    if (sub) {
        const nameEl = document.getElementById('authorName');
        nameEl.textContent = sub._sName;
        nameEl.href = sub._sProfileUrl;
        document.getElementById('authorAvatar').src = sub._sAvatarUrl || 'https://images.gamebanana.com/img/av/default.png';
        document.getElementById('authorTitle').textContent = sub._sUserTitle || '';
        if (sub._bIsOnline) document.getElementById('onlineStatus').classList.add('online');
        
        const wall = document.getElementById('medalsWall');
        const allMedals = [...(sub._aNormalMedals || []), ...(sub._aRareMedals || []), ...(sub._aLegendaryMedals || [])];
        allMedals.forEach(m => {
            const img = document.createElement('img');
            img.className = 'medal-icon';
            img.src = `https://images.gamebanana.com/img/ico/medals/${m[0]}`;
            img.title = m[1];
            wall.appendChild(img);
        });
    }

    // 游戏归属渲染
    if (data._aGame) {
        document.getElementById('gameName').textContent = data._aGame._sName;
        document.getElementById('gameIcon').src = data._aGame._sIconUrl;
    }
}

/**
 * 初始化详情页
 */
async function init() {
    const modId = window.location.pathname.split('/').pop();
    if (!modId || isNaN(modId)) return;

    // 翻译表的基础路径设为 /mod/
    await Translator.loadTranslationTable('/mod/');

    try {
        const response = await fetch(`https://gamebanana.com/apiv11/Mod/${modId}/ProfilePage`);
        if (!response.ok) throw new Error('无法从 GameBanana 获取数据');
        const data = await response.json();
        render(data);
    } catch (err) {
        console.error(err);
        const nameEl = document.getElementById('modName');
        if (nameEl) nameEl.textContent = "数据获取失败";
    } finally {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.classList.add('hidden');
        const mainContent = document.getElementById('mainContent');
        if (mainContent) mainContent.style.display = 'block';
    }
}

document.addEventListener('DOMContentLoaded', init);