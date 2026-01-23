window.Settings = (() => {
  const STORAGE_KEY = 'mods_settings_v1'; // 本地存储键名
  let state = {
    thumbQuality: window.Config.DEFAULT_THUMB_QUALITY, // 缩略图质量
    columnCount: 0, // 列数(0表示自动)
    userId: '', // 用户ID
    nsfwMode: 'show',
    contentFilter: 'mods', // 筛选：all / mods / posts
  };

  // 从本地存储加载设置
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

  // 保存设置到本地存储
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Settings save error', e);
    }
  }

  // 获取指定设置项的值
  function get(key) {
    return state[key];
  }

  // 设置指定项的值并保存
  function set(key, val) {
    state[key] = val;
    save();
  }

  // 获取所有设置
  function all() {
    return state;
  }

  return { load, save, get, set, all };
})();