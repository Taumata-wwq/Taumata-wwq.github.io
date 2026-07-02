/* ============================================================
   picker.js — SAI/CSP 风格 HSV 色板
   ============================================================ */

import { state, setRgb, parseRgb, rgbToHex, hexToRgb, rgbToHsv, hsvToRgb, clamp, showToast } from './theme.js';
import { t } from './i18n.js';

let picker = null, svSquare = null, hueBar = null;
let svPointer = null, huePointer = null, hexInput = null, swatch = null;

/* 同步色板 UI 到当前 state.accent_rgb */
export function syncPicker() {
  if (!svSquare) return;
  const c = parseRgb(state.accent_rgb);
  const hsv = rgbToHsv(c.r, c.g, c.b);
  svPointer.style.left = (hsv.s * 100) + '%';
  svPointer.style.top = ((1 - hsv.v) * 100) + '%';
  huePointer.style.top = (hsv.h / 360 * 100) + '%';
  svSquare.style.backgroundColor = 'hsl(' + hsv.h + ', 100%, 50%)';
  if (hexInput && document.activeElement !== hexInput) hexInput.value = rgbToHex(c.r, c.g, c.b);
  if (swatch) swatch.style.background = 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')';
}

export function openPicker() {
  if (!picker) return;
  picker.classList.add('is-open');
  picker.setAttribute('aria-hidden', 'false');
  const btn = document.getElementById('pickerOpen');
  if (btn) btn.classList.add('is-active');
  syncPicker();
}

export function closePicker() {
  if (!picker) return;
  picker.classList.remove('is-open');
  picker.setAttribute('aria-hidden', 'true');
  const btn = document.getElementById('pickerOpen');
  if (btn) btn.classList.remove('is-active');
}

export function togglePicker() {
  if (!picker) return;
  if (picker.classList.contains('is-open')) closePicker(); else openPicker();
}

/* SV 方块拖拽 + 键盘 */
function bindSV() {
  let dragging = false;
  function update(e) {
    const rect = svSquare.getBoundingClientRect();
    const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((e.clientY - rect.top) / rect.height, 0, 1);
    const c = parseRgb(state.accent_rgb);
    const hsv = rgbToHsv(c.r, c.g, c.b);
    hsv.s = x;
    hsv.v = 1 - y;
    const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
    setRgb(rgb.r, rgb.g, rgb.b);
  }
  svSquare.addEventListener('mousedown', (e) => { dragging = true; update(e); e.preventDefault(); });
  svSquare.addEventListener('touchstart', (e) => { dragging = true; update(e.touches[0]); e.preventDefault(); }, { passive: false });
  document.addEventListener('mousemove', (e) => { if (dragging) update(e); });
  document.addEventListener('touchmove', (e) => { if (dragging) { update(e.touches[0]); e.preventDefault(); } }, { passive: false });
  document.addEventListener('mouseup', () => { dragging = false; });
  document.addEventListener('touchend', () => { dragging = false; });
  svSquare.addEventListener('keydown', (e) => {
    const c = parseRgb(state.accent_rgb);
    const hsv = rgbToHsv(c.r, c.g, c.b);
    const step = e.shiftKey ? 0.1 : 0.02;
    if (e.key === 'ArrowRight') { hsv.s = clamp(hsv.s + step, 0, 1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { hsv.s = clamp(hsv.s - step, 0, 1); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { hsv.v = clamp(hsv.v + step, 0, 1); e.preventDefault(); }
    else if (e.key === 'ArrowDown') { hsv.v = clamp(hsv.v - step, 0, 1); e.preventDefault(); }
    else return;
    const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
    setRgb(rgb.r, rgb.g, rgb.b);
  });
}

/* 色相条拖拽 + 键盘 */
function bindHue() {
  let dragging = false;
  function update(e) {
    const rect = hueBar.getBoundingClientRect();
    const y = clamp((e.clientY - rect.top) / rect.height, 0, 1);
    const c = parseRgb(state.accent_rgb);
    const hsv = rgbToHsv(c.r, c.g, c.b);
    hsv.h = y * 360;
    const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
    setRgb(rgb.r, rgb.g, rgb.b);
  }
  hueBar.addEventListener('mousedown', (e) => { dragging = true; update(e); e.preventDefault(); });
  hueBar.addEventListener('touchstart', (e) => { dragging = true; update(e.touches[0]); e.preventDefault(); }, { passive: false });
  document.addEventListener('mousemove', (e) => { if (dragging) update(e); });
  document.addEventListener('touchmove', (e) => { if (dragging) { update(e.touches[0]); e.preventDefault(); } }, { passive: false });
  document.addEventListener('mouseup', () => { dragging = false; });
  document.addEventListener('touchend', () => { dragging = false; });
  hueBar.addEventListener('keydown', (e) => {
    const c = parseRgb(state.accent_rgb);
    const hsv = rgbToHsv(c.r, c.g, c.b);
    const step = e.shiftKey ? 15 : 3;
    if (e.key === 'ArrowUp') { hsv.h = (hsv.h - step + 360) % 360; e.preventDefault(); }
    else if (e.key === 'ArrowDown') { hsv.h = (hsv.h + step) % 360; e.preventDefault(); }
    else return;
    const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
    setRgb(rgb.r, rgb.g, rgb.b);
  });
}

/* 初始化色板：抓 DOM + 绑事件 */
export function initPicker() {
  picker = document.getElementById('colorpicker');
  svSquare = document.getElementById('svSquare');
  hueBar = document.getElementById('hueBar');
  svPointer = document.getElementById('svPointer');
  huePointer = document.getElementById('huePointer');
  hexInput = document.getElementById('pickerHex');
  swatch = document.getElementById('pickerSwatch');
  if (!picker) return;

  /* 开关按钮 */
  const opener = document.getElementById('pickerOpen');
  if (opener) opener.addEventListener('click', (e) => { e.stopPropagation(); togglePicker(); });

  /* 点击外部关闭 */
  document.addEventListener('click', (e) => {
    if (!picker.classList.contains('is-open')) return;
    if (picker.contains(e.target)) return;
    if (opener && opener.contains(e.target)) return;
    closePicker();
  });

  if (svSquare && svPointer) bindSV();
  if (hueBar && huePointer) bindHue();

  /* Hex 输入 */
  if (hexInput) {
    hexInput.addEventListener('input', () => {
      let v = hexInput.value.trim();
      if (v.indexOf('#') !== 0) v = '#' + v;
      const c = hexToRgb(v);
      if (c) setRgb(c.r, c.g, c.b);
    });
    hexInput.addEventListener('blur', () => {
      const c = parseRgb(state.accent_rgb);
      hexInput.value = rgbToHex(c.r, c.g, c.b);
    });
  }

  /* 重置按钮 */
  const reset = document.getElementById('pickerReset');
  if (reset) {
    reset.addEventListener('click', () => {
      import('./theme.js').then((m) => {
        m.state.mode = m.DEFAULT_MODE;
        m.state.accent_rgb = m.DEFAULT_RGB;
        m.applyTheme();
        m.saveTheme();
        showToast(t('toast.reset', state.lang));
      });
    });
  }
}
