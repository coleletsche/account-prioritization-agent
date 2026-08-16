"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

export const RANKING_PAGE_SIZE = 25;

export function RankingPagination({ page, totalItems, onPageChange }: { page: number; totalItems: number; onPageChange: (page: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(totalItems / RANKING_PAGE_SIZE));
  if (totalPages <= 1) return null;

  return (
    <nav className="ranking-pagination" aria-label="Account ranking pages">
      <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Previous page"><ChevronLeft size={16} /> Previous</button>
      <span><strong>Page {page}</strong> of {totalPages}</span>
      <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} aria-label="Next page">Next <ChevronRight size={16} /></button>
    </nav>
  );
}
