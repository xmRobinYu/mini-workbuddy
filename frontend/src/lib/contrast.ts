/* =========================================================================
 * Contrast Auditor · WCAG 2.1
 * -------------------------------------------------------------------------
 * 从 tokens.css 解析 CSS 变量的当前计算值（OKLCH / rgb / hex 均可），
 * 计算 WCAG 相对亮度与对比度，并针对预设的「文本 / 按钮 / 边框」配对
 * 输出 pass / warn / fail 报告。
 *
 * 判定阈值（WCAG 2.1）：
 *   - 正文文本：≥ 4.5 : 1 (AA)  / ≥ 7 : 1 (AAA)
 *   - 大号文本 (≥18pt 或 ≥14pt Bold)：≥ 3 : 1 (AA)
 *   - UI 组件 / 边框 / 图形：≥ 3 : 1 (AA · non-text)
 * ========================================================================= */

/** 单条对比度检查规则 */
export type ContrastRule = {
  id: string;
  label: string;
  /** 前景色 CSS 变量名（不含 -- 前缀）*/
  fg: string;
  /** 背景色 CSS 变量名 */
  bg: string;
  /** 目标最小对比度；文本默认 4.5，UI/边框 3 */
  minRatio: number;
  /** 语义分类，便于分组展示 */
  kind: "text" | "large-text" | "ui" | "border";
  /** 该配对在 UI 中的典型使用场景 */
  usage: string;
};

/** 检查结果 */
export type ContrastResult = ContrastRule & {
  ratio: number;
  /** pass = 达标；warn = 达到 3:1 但未达文本 4.5:1；fail = 低于目标 */
  status: "pass" | "warn" | "fail";
  fgColor: string;
  bgColor: string;
};

/** 主题范围 */
export type ThemeScope = "light" | "dark";

/* ---------- 颜色解析 ---------- */

/** 把浏览器计算出的任何颜色字符串转换为 [r,g,b]（0-255）*/
function parseColorToRgb(input: string): [number, number, number] | null {
  if (!input || typeof document === "undefined") return null;
  const probe = document.createElement("div");
  probe.style.color = input;
  probe.style.display = "none";
  document.body.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  document.body.removeChild(probe);
  const m = computed.match(/rgba?\(([^)]+)\)/i);
  if (!m) return null;
  const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
  return [parts[0], parts[1], parts[2]];
}

/** WCAG 相对亮度 */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const conv = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * conv(r) + 0.7152 * conv(g) + 0.0722 * conv(b);
}

/** 对比度比值，返回如 4.51 */
export function contrastRatio(fg: string, bg: string): number {
  const fgRgb = parseColorToRgb(fg);
  const bgRgb = parseColorToRgb(bg);
  if (!fgRgb || !bgRgb) return 0;
  const L1 = relativeLuminance(fgRgb);
  const L2 = relativeLuminance(bgRgb);
  const [a, b] = L1 > L2 ? [L1, L2] : [L2, L1];
  return Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100;
}

/* ---------- 规则集 ---------- */

/**
 * 覆盖 PRD 中的关键文本与按钮组合。
 * 顺序决定报告展示顺序（先文本后 UI）。
 */
export const CONTRAST_RULES: ContrastRule[] = [
  // —— 主要文本
  { id: "body", label: "正文文本", fg: "foreground", bg: "background", minRatio: 4.5, kind: "text", usage: "页面主要文字 text-foreground" },
  { id: "card", label: "卡片文本", fg: "card-foreground", bg: "card", minRatio: 4.5, kind: "text", usage: "Card / Dialog 内容" },
  { id: "popover", label: "浮层文本", fg: "popover-foreground", bg: "popover", minRatio: 4.5, kind: "text", usage: "Popover / DropdownMenu" },
  { id: "muted", label: "次要说明文本", fg: "muted-foreground", bg: "background", minRatio: 4.5, kind: "text", usage: "text-muted-foreground 说明" },
  { id: "sidebar", label: "侧边栏文本", fg: "sidebar-foreground", bg: "sidebar", minRatio: 4.5, kind: "text", usage: "AppSidebar 导航项" },

  // —— 按钮 / 品牌 CTA
  { id: "brand", label: "品牌按钮文本", fg: "brand-foreground", bg: "brand", minRatio: 4.5, kind: "text", usage: "主要 CTA <Button>" },
  { id: "primary", label: "Primary 按钮文本", fg: "primary-foreground", bg: "primary", minRatio: 4.5, kind: "text", usage: "shadcn Button default" },
  { id: "secondary", label: "次级按钮文本", fg: "secondary-foreground", bg: "secondary", minRatio: 4.5, kind: "text", usage: "Button variant='secondary'" },
  { id: "destructive", label: "危险按钮文本", fg: "destructive-foreground", bg: "destructive", minRatio: 4.5, kind: "text", usage: "删除 / 破坏性操作" },
  { id: "warning", label: "警告徽标文本", fg: "warning-foreground", bg: "warning", minRatio: 4.5, kind: "text", usage: "warning Badge / Toast" },
  { id: "accent-btn", label: "Accent 按钮文本", fg: "accent-foreground", bg: "accent", minRatio: 4.5, kind: "text", usage: "hover 悬浮 / DropdownItem" },
  { id: "sidebar-primary", label: "侧栏高亮项文本", fg: "sidebar-primary-foreground", bg: "sidebar-primary", minRatio: 4.5, kind: "text", usage: "选中的导航项" },

  // —— UI 非文本
  { id: "border", label: "边框对比", fg: "border", bg: "background", minRatio: 3, kind: "border", usage: "卡片 / 输入框边框" },
  { id: "ring", label: "焦点环对比", fg: "ring", bg: "background", minRatio: 3, kind: "ui", usage: ":focus-visible 轮廓" },
  { id: "brand-soft-text", label: "brand-soft 上的品牌文字", fg: "brand", bg: "brand-soft", minRatio: 4.5, kind: "text", usage: "brand-soft 徽标内文字" },
];

/* ---------- 运行时评估 ---------- */

/**
 * 在指定主题下评估所有规则。
 * 通过创建一个带 .light 或 .dark 类的隔离容器，获取该主题下 CSS 变量的
 * 真实计算值——不会影响页面当前主题。
 */
export function evaluateContrast(scope: ThemeScope): ContrastResult[] {
  if (typeof document === "undefined") return [];

  const probe = document.createElement("div");
  probe.className = scope === "dark" ? "dark" : "light";
  probe.style.position = "fixed";
  probe.style.left = "-9999px";
  probe.style.top = "0";
  probe.style.width = "1px";
  probe.style.height = "1px";
  probe.style.visibility = "hidden";
  document.body.appendChild(probe);

  const style = getComputedStyle(probe);
  const read = (name: string) => style.getPropertyValue(`--${name}`).trim();

  const results = CONTRAST_RULES.map<ContrastResult>((rule) => {
    const fgColor = read(rule.fg);
    const bgColor = read(rule.bg);
    const ratio = contrastRatio(fgColor, bgColor);
    let status: ContrastResult["status"] = "pass";
    if (ratio < rule.minRatio) {
      status = ratio >= 3 && rule.kind === "text" ? "warn" : "fail";
    }
    return { ...rule, ratio, status, fgColor, bgColor };
  });

  document.body.removeChild(probe);
  return results;
}

/** 汇总统计 */
export function summarize(results: ContrastResult[]) {
  return {
    total: results.length,
    pass: results.filter((r) => r.status === "pass").length,
    warn: results.filter((r) => r.status === "warn").length,
    fail: results.filter((r) => r.status === "fail").length,
  };
}
