import { DOM } from './config.js';

export const Toast = (() => {
  /**
   * 显示一条通知
   * @param {string} message 消息内容
   * @param {string} type 类型: info, success, error
   * @param {number} duration 持续时间(ms)
   */
  function show(message, type = 'info', duration = 3000) {
    if (!DOM.toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    DOM.toastContainer.appendChild(toast);

    // 进场动画触发
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    // 自动销毁
    setTimeout(() => {
      toast.classList.remove('show');
      toast.addEventListener('transitionend', () => {
        toast.remove();
      });
    }, duration);
  }

  return { show };
})();