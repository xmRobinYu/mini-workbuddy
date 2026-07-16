import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowDownAZ, ArrowUpAZ, Search, X } from "lucide-react";

export type SortOption = { value: string; label: string };

export function ListToolbar({
  q,
  onQChange,
  filters = [],
  activeFilter,
  onFilterChange,
  sortOptions,
  sort,
  order,
  onSortChange,
  onOrderChange,
  right,
  placeholder = "搜索...",
  canReset,
  onReset,
}: {
  q: string;
  onQChange: (v: string) => void;
  filters?: readonly string[];
  activeFilter?: string;
  onFilterChange?: (v: string) => void;
  sortOptions: SortOption[];
  sort: string;
  order: "asc" | "desc";
  onSortChange: (v: string) => void;
  onOrderChange: (v: "asc" | "desc") => void;
  right?: React.ReactNode;
  placeholder?: string;
  canReset?: boolean;
  onReset?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative max-w-xs flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => onQChange(e.target.value)}
          placeholder={placeholder}
          className="h-9 bg-surface-elevated pl-8"
        />
      </div>
      {filters.length > 0 && onFilterChange && (
        <div className="flex gap-1">
          {filters.map((t) => (
            <Button
              key={t}
              variant={t === activeFilter ? "secondary" : "ghost"}
              size="sm"
              className="h-8"
              onClick={() => onFilterChange(t)}
            >
              {t}
            </Button>
          ))}
        </div>
      )}
      <div className="ml-auto flex items-center gap-1.5">
        <Select value={sort} onValueChange={onSortChange}>
          <SelectTrigger className="h-8 w-[130px] bg-surface-elevated text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sortOptions.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">
                排序：{o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title={order === "asc" ? "升序" : "降序"}
          onClick={() => onOrderChange(order === "asc" ? "desc" : "asc")}
        >
          {order === "asc" ? <ArrowUpAZ className="h-4 w-4" /> : <ArrowDownAZ className="h-4 w-4" />}
        </Button>
        {canReset && (
          <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={onReset}>
            <X className="h-3 w-3" /> 重置
          </Button>
        )}
        {right}
      </div>
    </div>
  );
}
