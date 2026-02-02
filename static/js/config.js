
export const Config = {
  PER_SKELETON: 4, 
  BASE_POLL_INTERVAL: 5000, 
  MAX_POLL_INTERVAL: 30000, 
  BACKOFF_FACTOR: 2, 
  INITIAL_SKELETON_COUNT: 8, 
  SCROLL_ROOT_MARGIN: '200px', 
  DEFAULT_MODE: 'recommended', 
  DEFAULT_COLUMN_BREAKPOINTS: { sm: 768, md: 1024 }, 
  DEFAULT_THUMB_QUALITY: '530', 
  STRINGS: {
    LOADING_FAILED: '加载失败，稍后重试',
    NO_MORE: '没有更多了',
    GETTING: '获取中...',
    UNKNOWN: '未知',
    USERID_NOT_NUM: '用户ID必须是数字'
  }
};

export const DOM = {
  MODS_CONTAINER: document.getElementById('mods'),
  LOADER: document.getElementById('loader'),
  SENTINEL: document.getElementById('sentinel'),
  BACK_TOP: document.getElementById('backTop'),
  SETTINGS_BTN: document.getElementById('settingsBtn'),
  SETTINGS_MODAL: document.getElementById('settingsModal'),
  CLOSE_SETTINGS: document.getElementById('closeSettings'),
  menuList: document.getElementById('menuList'),
  menuBtn: document.getElementById('menuBtn'),
  howToBtn: document.getElementById('howToBtn'),
  howToPopover: document.getElementById('howToPopover'),
  userIdInput: document.getElementById('userIdInput'),
  thumbQualitySlider: document.getElementById('thumbQualitySlider'),
  columnCountSlider: document.getElementById('columnCountSlider'),
  topbar: document.querySelector('.topbar'),
  toastContainer: document.getElementById('toastContainer'),
  healthDot: document.getElementById('healthDot'),
  
  // 详情页 SPA 引用
  detailOverlay: document.getElementById('detailOverlay'),
  closeDetail: document.getElementById('closeDetail'),
  detailLoading: document.getElementById('detailLoading'),
  detailMainContent: document.getElementById('detailMainContent')
};
