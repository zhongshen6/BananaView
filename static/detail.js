/* 每次修改后修改次数加一，并另起一行写下这次的修改内容*/
/* 第2次修改，写修改内容请另起一行 */
/* 1：分离代码 
*/


/**
 * BananaView 详情页逻辑模块
 * 处理 Mod 数据的异步加载、渲染、翻译及交互
 */

// 自动重定向逻辑：如果 URL 非法或没有 ID，重定向回首页
(function() {
    const pathParts = window.location.pathname.split('/');
    const modId = pathParts.pop();
    if (!modId || isNaN(modId) || modId === 'detail.html') {
        window.location.href = '/mod/';
    }
})();

// 翻译功能集成
const Translator = (() => {
    let translationMap = new Map();
    let isLoaded = false;
    let sortedKeys = null;

    async function load() {
        try {
            // 获取前端翻译字典
            const res = await fetch('/mod/static/words-frontend.json');
            const words = await res.json();
            for (const word of words) {
                if (word.en && word.zhCN) {
                    translationMap.set(word.en.toLowerCase(), word.zhCN);
                }
            }
            // 预排序键值，实现最长匹配
            sortedKeys = Array.from(translationMap.keys()).sort((a, b) => b.length - a.length);
            isLoaded = true;
        } catch (e) { console.warn('Translator load failed', e); }
    }

    function translate(text) {
        if (!isLoaded || !text) return text;
        let result = text;
        const lower = () => result.toLowerCase();
        for (const key of sortedKeys) {
            const idx = lower().indexOf(key);
            if (idx !== -1) {
                // 单词边界启发式检查
                const isBoundary = (idx === 0 || !result[idx-1].match(/[a-z]/i)) && 
                                   (idx + key.length === result.length || !result[idx+key.length].match(/[a-z]/i));
                if (isBoundary) {
                    const original = result.substring(idx, idx + key.length);
                    let replacement = translationMap.get(key);
                    // 保持首字母大小写
                    if (original[0] === original[0].toUpperCase()) 
                        replacement = replacement[0].toUpperCase() + replacement.slice(1);
                    result = result.substring(0, idx) + replacement + result.substring(idx + key.length);
                }
            }
        }
        return result;
    }
    return { load, translate };
})();

/**
 * 格式化 Unix 时间戳
 */
function formatDate(ts) {
    if (!ts) return "未知";
    const d = new Date(ts * 1000);
    return d.toLocaleDateString();
}

/**
 * 格式化文件大小
 */
function formatSize(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 核心切换图片逻辑：带预加载
 * 确保背景图和主图在切换时不出现闪烁或空白
 */
async function switchImage(url, thumbElement) {
    const mainImg = document.getElementById('mainImage');
    const heroBg = document.getElementById('heroBg');
    const container = document.getElementById('mainImgContainer');

    // 1. 立即更新缩略图状态（即时反馈）
    document.querySelectorAll('.thumb-item').forEach(t => t.classList.remove('active'));
    if (thumbElement) thumbElement.classList.add('active');

    // 2. 显示加载状态
    container.classList.add('is-loading');

    // 3. 创建预加载对象
    const preload = new Image();
    preload.src = url;

    try {
        // 等待图片加载完成
        await new Promise((resolve, reject) => {
            preload.onload = resolve;
            preload.onerror = reject;
        });

        // 4. 加载成功后同步更新 DOM，利用浏览器缓存实现瞬时替换
        mainImg.src = url;
        heroBg.style.backgroundImage = `url('${url}')`;
    } catch (e) {
        console.error('图片预加载失败', e);
        // 失败时直接尝试赋值
        mainImg.src = url;
        heroBg.style.backgroundImage = `url('${url}')`;
    } finally {
        // 5. 移除加载态
        container.classList.remove('is-loading');
    }
}

/**
 * 初始化详情页
 */
async function init() {
    const modId = window.location.pathname.split('/').pop();
    if (!modId || isNaN(modId)) return;

    // 并发加载翻译表
    await Translator.load();

    try {
        // 直接请求 GameBanana API 获取完整详情数据
        const response = await fetch(`https://gamebanana.com/apiv11/Mod/${modId}/ProfilePage`);
        if (!response.ok) throw new Error('无法从 GameBanana 获取数据');
        const data = await response.json();
        render(data);
    } catch (err) {
        console.error(err);
        const nameEl = document.getElementById('modName');
        if (nameEl) nameEl.textContent = "数据获取失败";
    } finally {
        // 渲染完成后隐藏加载层
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.classList.add('hidden');
        const mainContent = document.getElementById('mainContent');
        if (mainContent) mainContent.style.display = 'block';
    }
}

/**
 * 渲染页面内容
 */
function render(data) {
    // 1. 基础文本信息
    const name = Translator.translate(data._sName);
    const modNameEl = document.getElementById('modName');
    if (modNameEl) modNameEl.textContent = name;
    document.title = name + " - BananaView";

    const addDateEl = document.getElementById('addDate');
    if (addDateEl) addDateEl.textContent = formatDate(data._tsDateAdded);
    
    const viewCountEl = document.getElementById('viewCount');
    if (viewCountEl) viewCountEl.textContent = data._nViewCount || 0;
    
    const likeCountEl = document.getElementById('likeCount');
    if (likeCountEl) likeCountEl.textContent = data._nLikeCount || 0;
    
    const dlCountEl = document.getElementById('dlCount');
    if (dlCountEl) dlCountEl.textContent = data._nDownloadCount || 0;
    
    const descEl = document.getElementById('modDescription');
    if (descEl) descEl.innerHTML = data._sText || data._sDescription || "无描述";
    
    const dlBtn = document.getElementById('mainDownloadBtn');
    if (dlBtn) dlBtn.href = data._sDownloadUrl;

    // 2. 许可证处理
    if (data._sLicense) {
        const licSection = document.getElementById('licenseSection');
        if (licSection) licSection.style.display = 'block';
        const licInfo = document.getElementById('licenseInfo');
        if (licInfo) licInfo.innerHTML = data._sLicense;
    }

    // 3. 画廊缩略图列表处理
    const images = data._aPreviewMedia?._aImages;
    const thumbList = document.getElementById('thumbList');

    if (images && images.length > 0 && thumbList) {
        images.forEach((img, idx) => {
            const fullUrl = `${img._sBaseUrl}/${img._sFile}`;
            const thumbUrl = img._sFile100 ? `${img._sBaseUrl}/${img._sFile100}` : 
                           (img._sFile220 ? `${img._sBaseUrl}/${img._sFile220}` : fullUrl);
            
            const thumb = document.createElement('div');
            thumb.className = `thumb-item ${idx === 0 ? 'active' : ''}`;
            thumb.innerHTML = `<img src="${thumbUrl}">`;
            thumb.onclick = () => switchImage(fullUrl, thumb);
            thumbList.appendChild(thumb);

            // 默认显示第一张图
            if (idx === 0) {
                switchImage(fullUrl, thumb);
            }
        });
    }

    // 4. 前置要求处理
    if (data._aRequirements && data._aRequirements.length > 0) {
        const reqSection = document.getElementById('reqSection');
        const reqList = document.getElementById('reqList');
        if (reqSection && reqList) {
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
    }

    // 5. 文件下载列表渲染
    const fileList = document.getElementById('fileList');
    if (fileList && data._aFiles && data._aFiles.length > 0) {
        data._aFiles.forEach(f => {
            const div = document.createElement('div');
            div.className = 'file-item';
            const downloadUrl = `https://gamebanana.com/dl/${f._idRow}`;
            div.innerHTML = `
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:600; font-size:0.85rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${f._sFile}">${f._sFile}</div>
                    <div style="font-size:0.7rem; color:var(--muted);">${f._sDescription || '无说明'}</div>
                </div>
                <div style="text-align:right; flex-shrink:0;">
                    <div style="font-size:0.8rem; font-weight:600;">${formatSize(f._nFilesize)}</div>
                    <a href="${downloadUrl}" class="inline-download-btn">直接下载</a>
                </div>
            `;
            fileList.appendChild(div);
        });
    }

    // 6. 发布者信息渲染
    const sub = data._aSubmitter;
    if (sub) {
        const authorNameEl = document.getElementById('authorName');
        if (authorNameEl) {
            authorNameEl.textContent = sub._sName;
            authorNameEl.href = sub._sProfileUrl;
        }
        const avatarEl = document.getElementById('authorAvatar');
        if (avatarEl) avatarEl.src = sub._sAvatarUrl || 'https://images.gamebanana.com/img/av/default.png';
        const authorTitleEl = document.getElementById('authorTitle');
        if (authorTitleEl) authorTitleEl.textContent = sub._sUserTitle || '';
        const onlineDot = document.getElementById('onlineStatus');
        if (sub._bIsOnline && onlineDot) onlineDot.classList.add('online');
        
        // 勋章墙渲染
        const wall = document.getElementById('medalsWall');
        const allMedals = [...(sub._aNormalMedals || []), ...(sub._aRareMedals || []), ...(sub._aLegendaryMedals || [])];
        if (wall) {
            allMedals.forEach(m => {
                const img = document.createElement('img');
                img.className = 'medal-icon';
                img.src = `https://images.gamebanana.com/img/ico/medals/${m[0]}`;
                img.title = m[1];
                wall.appendChild(img);
            });
        }
    }

    // 7. 游戏归属信息
    if (data._aGame) {
        const gameNameEl = document.getElementById('gameName');
        if (gameNameEl) gameNameEl.textContent = data._aGame._sName;
        const gameIconEl = document.getElementById('gameIcon');
        if (gameIconEl) gameIconEl.src = data._aGame._sIconUrl;
    }
}

document.addEventListener('DOMContentLoaded', init);