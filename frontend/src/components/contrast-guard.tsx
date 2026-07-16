import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { evaluateContrast, summarize } from "@/lib/contrast";
import { useTheme } from "@/lib/theme";

const STORAGE_KEY = "wb-contrast-alert-dismissed";

/**
 * 挂载后在下一 tick 校验浅色 + 深色主题的关键令牌对比度。
 * 出现失败项时弹出一次持久 toast，提示打开 /tokens 查看详情；
 * 用户点击"知道了"后本会话不再重复弹。
 * accent 变化会重新触发一次校验（因为 useTheme 依赖 mode/resolved，
 * 强调色注入的 <style> 与 mode 联动，重新渲染即会重新计算）。
 */
export function ContrastGuard() {
  const { mode, resolved } = useTheme();
  const alertedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(STORAGE_KEY) === "1") return;

    // 等一帧，让强调色 <style> 与字体应用生效
    const id = window.setTimeout(() => {
      const light = summarize(evaluateContrast("light"));
      const dark = summarize(evaluateContrast("dark"));
      const totalFail = light.fail + dark.fail;
      if (totalFail === 0 || alertedRef.current) return;

      alertedRef.current = true;
      toast.warning(`设计令牌对比度报警 · ${totalFail} 项未达 WCAG AA`, {
        description: `浅色 ${light.fail} · 深色 ${dark.fail}。前往「设计令牌」页查看详情并调整变量。`,
        duration: 8000,
        action: {
          label: "知道了",
          onClick: () => sessionStorage.setItem(STORAGE_KEY, "1"),
        },
      });
    }, 400);

    return () => window.clearTimeout(id);
  }, [mode, resolved]);

  return null;
}
