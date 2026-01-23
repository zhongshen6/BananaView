import { Settings } from './settings.js';
import { UI } from './ui.js';
import { Toast } from './toast.js';
import { DOM, Config } from './config.js';
import { HealthMonitor } from './api.js';

export const Controls = (() => {
  // 声明 App 占位，稍后由 main.js 导入或通过初始化函数传入
  let App = null;

  function setApp(appInstance) {
    App = appInstance;
  }

  // 初始化滑块控件
  function initSlider(sliderId, valueKey) {
    const container = document.getElementById(sliderId);
    if (!container) return;
    const thumb = container.querySelector('.slider-thumb');
    const options = container.querySelectorAll('.slider-option');
    const count = options.length;
    const optionWidth = 42; 
    container.style.width = `${optionWidth * count}px`;

    function updateThumb(idx) {
      if (!thumb) return;
      const actualOptionWidth = container.clientWidth / count || optionWidth;
      thumb.style.width = `${Math.max(actualOptionWidth - 4, 8)}px`;
      thumb.style.left = `${actualOptionWidth * idx + 2}px`;
    }

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
        if (App) App.refresh();
        Toast.show(`正在重新加载...`, 'info', 2000);
      }
    }));

    window.addEventListener('resize', () => container._recalcThumb && container._recalcThumb());
    updateUI(savedValue);
  }

  // 绑定设置模态框事件
  function bindSettingsModal() {
    const { SETTINGS_BTN, SETTINGS_MODAL, CLOSE_SETTINGS, healthDot } = DOM;
    if (SETTINGS_BTN && SETTINGS_MODAL && CLOSE_SETTINGS) {
      SETTINGS_BTN.addEventListener('click', () => {
        SETTINGS_MODAL.classList.add('show');
        HealthMonitor.check();
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

    if (healthDot) {
      healthDot.addEventListener('click', (e) => {
        e.stopPropagation();
        HealthMonitor.check();
      });
    }
  }

  // 绑定用户ID输入框事件
  function bindUserIdInput() {
    const input = DOM.userIdInput;
    if (!input) return;
    const saved = Settings.get('userId');
    if (saved) input.value = saved;

    document.addEventListener('click', (e) => {
      if (!input.contains(e.target)) {
        const val = input.value.trim();
        if (/^\d*$/.test(val)) {
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

  // 绑定使用说明弹出框事件
  function bindHowToPopover() {
    const { howToBtn, howToPopover, howToPopoverArrow, closePopoverBtn } = DOM;
    if (!howToBtn || !howToPopover) return;

    function hidePopover() {
      if (!howToPopover || howToPopover.classList.contains('hidden')) return;
      howToPopover.classList.add('hidden');
    }

    function showPopover() {
      if (!howToPopover || !howToBtn) return;
      if (!howToPopover.classList.contains('hidden')) {
        hidePopover();
        return;
      }

      howToPopover.classList.remove('hidden');
      howToPopover.style.position = 'fixed';
      howToPopover.style.visibility = 'hidden';

      const rect = howToBtn.getBoundingClientRect();
      const popW = howToPopover.offsetWidth;
      const popH = howToPopover.offsetHeight;
      const margin = 8;

      let left = rect.left + rect.width / 2 - popW / 2;
      if (left < margin) left = margin;
      if (left + popW > window.innerWidth - margin) left = window.innerWidth - margin - popW;

      let top = rect.bottom + margin;
      let placeAbove = false;
      if (top + popH > window.innerHeight - margin) {
        top = rect.top - popH - margin;
        placeAbove = true;
      }

      const arrowW = howToPopoverArrow?.offsetWidth || 14;
      let arrowLeft = rect.left + rect.width / 2 - left - arrowW / 2;

      howToPopover.style.left = Math.round(left) + 'px';
      howToPopover.style.top = Math.round(top) + 'px';

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
    if (closePopoverBtn) closePopoverBtn.addEventListener('click', hidePopover);
  }

  // 绑定菜单事件
  function bindMenu() {
    const { menuBtn, menuList, SETTINGS_MODAL, userIdInput } = DOM;
    if (!menuBtn || !menuList) return;

    menuBtn.addEventListener('click', () => menuList.classList.toggle('show'));

    document.addEventListener('click', (e) => {
      if (!menuBtn.contains(e.target) && !menuList.contains(e.target)) menuList.classList.remove('show');
    });

    menuList.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        const action = item.dataset.action;
        const text = item.textContent;

        if (action === 'subscriptions' && !userIdInput.value.trim()) {
          Toast.show('请先设置用户ID以浏览订阅内容', 'error', 3000);
          SETTINGS_MODAL.classList.add('show');
          return;
        }

        if (App) App.setMode(action, text);
        Toast.show(`模式切换: ${text}`, 'info', 2000);
        menuList.classList.remove('show');
      });
    });
  }

  // 绑定顶部导航栏和回到顶部按钮事件
  function bindTopbarAndBackTop() {
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

    window.addEventListener('scroll', () => { 
      if (DOM.BACK_TOP) DOM.BACK_TOP.style.opacity = window.scrollY > 420 ? '1' : '0'; 
    });
    if (DOM.BACK_TOP) DOM.BACK_TOP.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  function bindResizeLayout() {
    window.addEventListener('resize', () => {
      UI.layoutMasonry();
    });
  }

  function initSliders() {
    initSlider('thumbQualitySlider', 'thumbQuality');
    initSlider('columnCountSlider', 'columnCount');
    initSlider('contentFilterSlider', 'contentFilter');
    initSlider('nsfwSlider', 'nsfwMode');
  }

  function initAll() {
    bindSettingsModal();
    bindUserIdInput();
    bindHowToPopover();
    bindMenu();
    bindTopbarAndBackTop();
    bindResizeLayout();
    initSliders();
  }

  return { initAll, setApp };
})();