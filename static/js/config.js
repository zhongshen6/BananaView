export const Config = {
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
  howToPopoverArrow: document.getElementById('howToPopover')?.querySelector('.popover-arrow'),
  closePopoverBtn: document.getElementById('howToPopover')?.querySelector('.btn-close-popover'),
  topbar: document.querySelector('.topbar'),
  toastContainer: document.getElementById('toastContainer'),
  healthDot: document.getElementById('healthDot')
};