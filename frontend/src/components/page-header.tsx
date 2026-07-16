import type { ReactNode } from "react";

/**
 * Unified page header.
 * - Title uses text-2xl (was 3xl) so it sits closer to table/section labels.
 * - Uses the same 12px baseline gap as the page grid.
 */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-semibold leading-tight text-foreground">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 max-w-2xl text-sm leading-snug text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  );
}
