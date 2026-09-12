"use client";

import { secondaryButtonClass } from "./types";

export default function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const pageItems = Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter(
      (item) => item === 1 || item === totalPages || Math.abs(item - page) <= 1,
    )
    .reduce<(number | "…")[]>((items, item, index, filteredItems) => {
      if (index > 0 && item - filteredItems[index - 1] > 1) items.push("…");
      items.push(item);
      return items;
    }, []);

  return (
    <nav
      aria-label="Student pages"
      className="mt-6 flex flex-wrap justify-center gap-1"
    >
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className={secondaryButtonClass}
      >
        ← Previous
      </button>
      {pageItems.map((item, index) =>
        item === "…" ? (
          <span
            key={`ellipsis-${index}`}
            className="px-2 py-2 text-sm text-slate-400 dark:text-slate-500"
          >
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            onClick={() => onPageChange(item)}
            className={`h-9 min-w-9 rounded-lg border px-2 text-sm font-semibold transition-colors ${
              page === item
                ? "border-[#8B6DF2] bg-[#8B6DF2]/10 text-[#8B6DF2]"
                : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
            }`}
          >
            {item}
          </button>
        ),
      )}
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className={secondaryButtonClass}
      >
        Next →
      </button>
    </nav>
  );
}