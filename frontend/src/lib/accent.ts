/**
 * Accent (brand) color — user-configurable, persisted to localStorage,
 * applied by injecting a <style id="wb-accent"> block that overrides the
 * brand-family tokens for both light and dark themes.
 *
 * Only hue + chroma from the picked color are used; lightness for each
 * token slot is standardized so contrast/AA characteristics stay stable.
 */

export type AccentPreset = {
  id: string;
  name: string;
  hex: string;
};

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: "blue", name: "克制蓝 (默认)", hex: "#2563EB" },
  { id: "indigo", name: "靛紫", hex: "#6366F1" },
  { id: "violet", name: "紫罗兰", hex: "#8B5CF6" },
  { id: "teal", name: "青碧", hex: "#0D9488" },
  { id: "emerald", name: "翠绿", hex: "#10B981" },
  { id: "amber", name: "琥珀", hex: "#D97706" },
  { id: "rose", name: "玫红", hex: "#E11D48" },
  { id: "slate", name: "石墨", hex: "#475569" },
];

export const ACCENT_STORAGE_KEY = "wb-accent";
const STYLE_ID = "wb-accent";

/* -------------------------------------------------------------- */
/* Color math: sRGB hex → OKLCH (H in degrees, C absolute)         */
/* -------------------------------------------------------------- */

function srgbToLinear(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function hexToHueChroma(hex: string): { H: number; C: number } | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = m[1];
  const r = srgbToLinear(parseInt(n.slice(0, 2), 16));
  const g = srgbToLinear(parseInt(n.slice(2, 4), 16));
  const b = srgbToLinear(parseInt(n.slice(4, 6), 16));

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m2 = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const A = 1.9779984951 * l - 2.4285922050 * m2 + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m2 - 0.8086757660 * s;

  const C = Math.sqrt(A * A + B * B);
  let H = (Math.atan2(B, A) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { H, C };
}

/* -------------------------------------------------------------- */
/* Token generation                                                */
/* -------------------------------------------------------------- */

function fmt(n: number, digits = 3): string {
  return Number(n.toFixed(digits)).toString();
}

/**
 * Build a CSS block overriding brand-family tokens for both themes.
 * Lightness values match tokens.css defaults so the AA contrast checks
 * that were verified against the default palette continue to hold.
 */
export function buildAccentCss(hex: string): string {
  const hc = hexToHueChroma(hex);
  if (!hc) return "";
  const H = fmt(hc.H, 2);
  // Clamp chroma so far-off custom colors don't produce out-of-gamut buttons.
  const C = Math.min(hc.C, 0.19);

  const lightBrand = `oklch(0.55 ${fmt(Math.min(C, 0.17))} ${H})`;
  const lightSoft = `oklch(0.955 ${fmt(Math.min(C, 0.04))} ${H})`;
  const darkBrand = `oklch(0.72 ${fmt(Math.min(C, 0.16))} ${H})`;
  const darkSoft = `oklch(0.3 ${fmt(Math.min(C, 0.08))} ${H})`;

  return [
    `:root,.light{`,
    `--brand:${lightBrand};`,
    `--brand-soft:${lightSoft};`,
    `--ring:${lightBrand};`,
    `--sidebar-primary:${lightBrand};`,
    `--sidebar-ring:${lightBrand};`,
    `}`,
    `.dark{`,
    `--brand:${darkBrand};`,
    `--brand-soft:${darkSoft};`,
    `--ring:${darkBrand};`,
    `--sidebar-primary:${darkBrand};`,
    `--sidebar-ring:${darkBrand};`,
    `}`,
  ].join("");
}

/* -------------------------------------------------------------- */
/* DOM application + persistence                                   */
/* -------------------------------------------------------------- */

export function applyAccent(hex: string | null): void {
  if (typeof document === "undefined") return;
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!hex) {
    if (el) el.remove();
    return;
  }
  const css = buildAccentCss(hex);
  if (!css) return;
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
}

export function readAccent(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(ACCENT_STORAGE_KEY);
    return v && /^#?[0-9a-fA-F]{6}$/.test(v) ? (v.startsWith("#") ? v : `#${v}`) : null;
  } catch {
    return null;
  }
}

export function writeAccent(hex: string | null): void {
  try {
    if (hex) window.localStorage.setItem(ACCENT_STORAGE_KEY, hex);
    else window.localStorage.removeItem(ACCENT_STORAGE_KEY);
  } catch {}
  applyAccent(hex);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("wb-accent-change", { detail: hex }));
  }
}

/**
 * Pre-hydration script — mirrors themeInitScript. Injected in <head> so the
 * user's accent applies before React hydrates, preventing a flash of the
 * default blue.
 */
export const accentInitScript = `
(function(){try{
  var k='${ACCENT_STORAGE_KEY}';
  var v=localStorage.getItem(k);
  if(!v||!/^#?[0-9a-fA-F]{6}$/.test(v))return;
  var hex=v.charAt(0)==='#'?v:'#'+v;
  function lin(x){x=x/255;return x<=0.04045?x/12.92:Math.pow((x+0.055)/1.055,2.4);}
  var n=hex.slice(1);
  var r=lin(parseInt(n.slice(0,2),16)),g=lin(parseInt(n.slice(2,4),16)),b=lin(parseInt(n.slice(4,6),16));
  var l=Math.cbrt(0.4122214708*r+0.5363325363*g+0.0514459929*b);
  var m=Math.cbrt(0.2119034982*r+0.6806995451*g+0.1073969566*b);
  var s=Math.cbrt(0.0883024619*r+0.2817188376*g+0.6299787005*b);
  var A=1.9779984951*l-2.4285922050*m+0.4505937099*s;
  var B=0.0259040371*l+0.7827717662*m-0.8086757660*s;
  var C=Math.sqrt(A*A+B*B);C=Math.min(C,0.19);
  var H=Math.atan2(B,A)*180/Math.PI;if(H<0)H+=360;
  function f(x){return (Math.round(x*1000)/1000).toString();}
  var lb='oklch(0.55 '+f(Math.min(C,0.17))+' '+f(H)+')';
  var ls='oklch(0.955 '+f(Math.min(C,0.04))+' '+f(H)+')';
  var db='oklch(0.72 '+f(Math.min(C,0.16))+' '+f(H)+')';
  var ds='oklch(0.3 '+f(Math.min(C,0.08))+' '+f(H)+')';
  var css=':root,.light{--brand:'+lb+';--brand-soft:'+ls+';--ring:'+lb+';--sidebar-primary:'+lb+';--sidebar-ring:'+lb+';}'
    +'.dark{--brand:'+db+';--brand-soft:'+ds+';--ring:'+db+';--sidebar-primary:'+db+';--sidebar-ring:'+db+';}';
  var el=document.createElement('style');el.id='wb-accent';el.textContent=css;document.head.appendChild(el);
}catch(e){}})();
`.trim();
