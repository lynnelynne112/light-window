'use strict';
const DEFAULTS = Object.freeze({ visibility: 25, hover: true, chromeHidden: false, topmost: true, delay: 100, fade: 220, zoom: 70 });
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n)));
const contains = (p, r) => !!r && p.x >= r.x && p.y >= r.y && p.x < r.x + r.width && p.y < r.y + r.height;
function preferences(value = {}) {
  const p = { ...DEFAULTS, ...value };
  for (const [key, lo, hi] of [['visibility',1,100],['delay',0,2000],['fade',80,600],['zoom',25,150]]) p[key] = Number.isFinite(+p[key]) ? clamp(p[key],lo,hi) : DEFAULTS[key];
  for (const key of ['hover','chromeHidden','topmost']) p[key] = !!p[key];
  return p;
}
class HoverController {
  constructor(adapter, prefs, now = 0) {
    this.adapter = adapter; this.prefs = prefs; this.current = prefs.visibility / 100;
    this.wanted = true; this.manual = false; this.outsideAt = null; this.fade = null; this.restoreUntil = 0;
    adapter.alpha(this.current);
  }
  transition(show, now, duration = this.prefs.fade) {
    this.wanted = show;
    if (show && !this.adapter.visible()) { this.current = 0; this.adapter.alpha(0); this.adapter.show(); }
    this.fade = { from: this.current, to: show ? this.prefs.visibility / 100 : 0, at: now, duration };
    if (Math.abs(this.fade.to - this.current) < 0.00001) { this.fade = null; if (!show) this.adapter.hide(); }
  }
  mode(enabled, now) { this.prefs.hover = enabled; this.manual = false; this.outsideAt = null; this.restoreUntil = 0; if (!enabled) this.transition(true, now); }
  opacity(value, now) { this.prefs.visibility = clamp(value,1,100); if (this.wanted && !this.manual) this.transition(true,now,100); }
  hide() { this.manual = true; this.wanted = false; this.fade = null; this.current = 0; this.adapter.alpha(0); this.adapter.hide(); }
  restore(now) { this.manual = false; this.outsideAt = null; this.restoreUntil = now + 1500; this.transition(true,now); }
  tick(pointer, now) {
    const inside = this.adapter.regions().some(r => contains(pointer,r));
    if (inside) { this.outsideAt = null; this.restoreUntil = 0; }
    let show = this.wanted;
    if (this.manual) show = false;
    else if (!this.prefs.hover || inside || now < this.restoreUntil) show = true;
    else { if (this.outsideAt === null) this.outsideAt = now; if (now - this.outsideAt >= this.prefs.delay) show = false; }
    if (show !== this.wanted) this.transition(show,now);
    if (this.fade) {
      const t = clamp((now - this.fade.at) / this.fade.duration,0,1);
      const eased = t*t*(3-2*t);
      this.current = this.fade.from + (this.fade.to-this.fade.from)*eased;
      this.adapter.alpha(this.current);
      if (t >= 1) { const target = this.fade.to; this.fade = null; if (target === 0) this.adapter.hide(); }
    }
  }
}
function fromLegacy(old) {
  return preferences({visibility:old.Visibility??25,hover:old.HoverReveal??true,chromeHidden:old.ChromeHidden??false,topmost:old.AlwaysOnTop??true,
    delay:old.HideDelay===350?100:(old.HideDelay??100),fade:old.FadeDuration??220,zoom:old.Zoom??70});
}
function chromeLayout(width,height,chromeHidden,controlsOpen,sitesOpen=false){
  const shown=!chromeHidden||controlsOpen;
  if(!shown)return {shown:false,top:0,nav:0,extras:0,footer:0,header:0};
  const top=Math.min(36,Math.max(0,height-1));
  const nav=width>=280&&height>=200?Math.min(34,Math.max(0,height-top-1)):0;
  const footer=width>=400&&height>=260?20:0;
  const preferred=sitesOpen?240:width>=400?64:width>=280?164:240;
  const extras=controlsOpen?Math.min(preferred,Math.max(0,height-top-nav-footer-Math.min(24,Math.floor(height*.2)))):0;
  return {shown:true,top,nav,extras,footer,header:top+nav+extras};
}
module.exports = { DEFAULTS, preferences, fromLegacy, contains, clamp, HoverController, chromeLayout };
