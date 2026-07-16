import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * 色觉模拟（Color Vision Deficiency, CVD）全局状态
 * -------------------------------------------------------------
 * · 提供全站唯一的 CVD 选择，主题预览卡片、色觉面板等均可联动
 * · 同时集中管理 SVG feColorMatrix 变换矩阵与 3×3 数值矩阵（供 JS 计算对比度使用）
 * · SVG <defs> 由 <CvdFilterDefs /> 在根节点挂载一次，任何位置均可通过
 *   `cvdFilterFor(key)` 得到 `filter: url(#cvd-<key>)` 引用
 */

export type CvdKey =
  | "normal"
  | "protanopia"
  | "deuteranopia"
  | "tritanopia"
  | "achromatopsia";

/** 3×3 RGB 矩阵（去掉 feColorMatrix 的 alpha/偏移列，用于 JS 端色彩变换） */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

export const CVD_MATRICES: Record<
  CvdKey,
  { label: string; short: string; desc: string; svg: string; mat: Mat3 }
> = {
  normal: {
    label: "正常视觉",
    short: "正常",
    desc: "参考基线，未做任何色觉变换",
    svg: "1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0",
    mat: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  },
  protanopia: {
    label: "红色盲 · Protanopia",
    short: "红色盲",
    desc: "缺失 L 视锥（约 1% 男性）",
    svg: "0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0",
    mat: [0.567, 0.433, 0, 0.558, 0.442, 0, 0, 0.242, 0.758],
  },
  deuteranopia: {
    label: "绿色盲 · Deuteranopia",
    short: "绿色盲",
    desc: "缺失 M 视锥（最常见）",
    svg: "0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0",
    mat: [0.625, 0.375, 0, 0.7, 0.3, 0, 0, 0.3, 0.7],
  },
  tritanopia: {
    label: "蓝色盲 · Tritanopia",
    short: "蓝色盲",
    desc: "缺失 S 视锥（罕见）",
    svg: "0.95 0.05 0 0 0  0 0.433 0.567 0 0  0 0.475 0.525 0 0  0 0 0 1 0",
    mat: [0.95, 0.05, 0, 0, 0.433, 0.567, 0, 0.475, 0.525],
  },
  achromatopsia: {
    label: "全色盲 · 灰度",
    short: "灰度",
    desc: "完全无色觉参照",
    svg: "0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0 0 0 1 0",
    mat: [0.299, 0.587, 0.114, 0.299, 0.587, 0.114, 0.299, 0.587, 0.114],
  },
};

export const CVD_ORDER: CvdKey[] = [
  "normal",
  "protanopia",
  "deuteranopia",
  "tritanopia",
  "achromatopsia",
];

/** 生成 CSS filter 值；normal 返回 "none" 以避免多余合成层 */
export function cvdFilterFor(key: CvdKey): string {
  return key === "normal" ? "none" : `url(#cvd-${key})`;
}

/* ---------- Context ---------- */

const STORAGE_KEY = "workbuddy.cvd";

type CvdCtx = {
  cvd: CvdKey;
  setCvd: (k: CvdKey) => void;
};

const CvdContext = createContext<CvdCtx | null>(null);

function isCvdKey(v: unknown): v is CvdKey {
  return typeof v === "string" && v in CVD_MATRICES;
}

export function CvdProvider({ children }: { children: ReactNode }) {
  const [cvd, setCvdState] = useState<CvdKey>("normal");

  // 读取持久化偏好（延迟到挂载后，避免 SSR 不匹配）
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (isCvdKey(raw)) setCvdState(raw);
    } catch {
      /* localStorage 不可用时忽略 */
    }
  }, []);

  const setCvd = useCallback((k: CvdKey) => {
    setCvdState(k);
    try {
      window.localStorage.setItem(STORAGE_KEY, k);
    } catch {
      /* 忽略 */
    }
  }, []);

  const value = useMemo<CvdCtx>(() => ({ cvd, setCvd }), [cvd, setCvd]);
  return <CvdContext.Provider value={value}>{children}</CvdContext.Provider>;
}

export function useCvd(): CvdCtx {
  const ctx = useContext(CvdContext);
  if (!ctx) throw new Error("useCvd 必须在 <CvdProvider> 内使用");
  return ctx;
}

/** 全局 SVG 滤镜定义——挂载一次即可，所有位置通过 url(#cvd-*) 引用 */
export function CvdFilterDefs() {
  return (
    <svg
      aria-hidden
      focusable="false"
      style={{ position: "absolute", width: 0, height: 0 }}
    >
      <defs>
        {CVD_ORDER.map((k) => (
          <filter key={k} id={`cvd-${k}`} colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values={CVD_MATRICES[k].svg} />
          </filter>
        ))}
      </defs>
    </svg>
  );
}
