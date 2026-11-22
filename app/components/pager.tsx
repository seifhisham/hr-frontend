"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const PAGE_SIZES = [25, 50, 100];

/** One page of an already-loaded list; the page is clamped so it always exists. */
export function pageSlice<T>(rows: T[], page: number, pageSize: number) {
  const size = pageSize > 0 ? pageSize : PAGE_SIZES[1];
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const start = (current - 1) * size;
  return {
    rows: rows.slice(start, start + size),
    page: current,
    pages,
    start,
    size,
    total: rows.length,
  };
}

/** Page controls for a list held in the browser. */
export function Pager({
  label,
  noun,
  page,
  pages,
  start,
  shown,
  total,
  pageSize,
  onPage,
  onPageSize,
}: {
  label: string;
  noun: [singular: string, plural: string];
  page: number;
  pages: number;
  start: number;
  shown: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  if (!total) return null;
  return (
    <div className="list-pager request-list-controls">
      <span className="request-result-count" role="status">
        Showing {start + 1}–{start + shown} of {total}{" "}
        {total === 1 ? noun[0] : noun[1]}
      </span>
      <label className="request-page-size">
        Per page
        <select
          value={pageSize}
          onChange={(event) => onPageSize(Number(event.target.value))}
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      <nav className="request-pagination" aria-label={label}>
        <button
          type="button"
          className="button secondary"
          disabled={page <= 1}
          onClick={() => onPage(1)}
        >
          First
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft size={16} aria-hidden="true" />
          Previous
        </button>
        <label className="request-page-size">
          Page
          <select
            value={page}
            aria-label={`${label}: page number`}
            onChange={(event) => onPage(Number(event.target.value))}
          >
            {Array.from({ length: pages }, (_, index) => (
              <option key={index + 1} value={index + 1}>
                {index + 1}
              </option>
            ))}
          </select>
          of {pages}
        </label>
        <button
          type="button"
          className="button secondary"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Next
          <ChevronRight size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={page >= pages}
          onClick={() => onPage(pages)}
        >
          Last
        </button>
      </nav>
    </div>
  );
}
