window.Api = (() => {
  const ALL_NON_MOD_MODELS = 'Tool,Question,Thread,Request';

  // 根据模式和页码构建 API URL
  function getApiUrl(mode, pageNum = 1) {
    const filter = window.Settings.get('contentFilter') || 'all';
    let inclusions = '';
    
    if (filter === 'mods') {
      inclusions = '&_csvModelInclusions=Mod';
    } else if (filter === 'posts') {
      inclusions = `&_csvModelInclusions=${ALL_NON_MOD_MODELS}`;
    } else {
      inclusions = '';
    }

    switch (mode) {
      case 'recommended':
        return `api/subcat?ids=0&_dummy=${Date.now()}`.replace('api/subcat', 'https://gamebanana.com/apiv11/Game/8552/Subfeed?_sSort=default' + inclusions + '&_nPage=' + pageNum);
      case 'latest':
        return `https://gamebanana.com/apiv11/Game/8552/Subfeed?_sSort=new${inclusions}&_nPage=${pageNum}`;
      case 'updated':
        return `https://gamebanana.com/apiv11/Game/8552/Subfeed?_sSort=updated${inclusions}&_nPage=${pageNum}`;
      case 'subscriptions': {
        const userId = window.Settings.get('userId');
        if (!userId) return null;
        return `https://gamebanana.com/apiv11/Member/${userId}/Subscriptions?_nPage=${pageNum}`;
      }
      default:
        return null;
    }
  }

  // 获取分类信息
  async function fetchSubcat(ids) {
    if (!Array.isArray(ids) || !ids.length) return {};
    const url = `api/subcat?ids=${ids.join(',')}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('分类别请求失败');
    const data = await res.json();
    return window.Translator.translateContent(data);
  }

  return { getApiUrl, fetchSubcat };
})();

window.HealthMonitor = (() => {
  async function check() {
    const { healthDot } = window.DOM;
    if (!healthDot) return;

    healthDot.className = 'status-dot loading';

    try {
      const data = await window.Api.fetchSubcat([475764]);
      const result = data['475764'] || data[475764];

      if (result && result.category) {
        healthDot.className = 'status-dot ok';
      } else {
        healthDot.className = 'status-dot warn';
      }
    } catch (err) {
      healthDot.className = 'status-dot error';
    }
  }

  return { check };
})();