/**
 * Shared geometry for the drafting title block (bottom-right corner).
 * @param {{ widthIn: number, heightIn: number }} page
 * @param {{ margin?: number, width?: number, height?: number }} [opts]
 */
export function titleBlockFrame(page, opts = {}) {
  const margin = opts.margin ?? 0.35;
  const w = opts.width ?? Math.min(8.25, page.widthIn * 0.42);
  const h = opts.height ?? 2.45;
  return {
    x: Math.max(margin, page.widthIn - margin - w),
    y: Math.max(margin, page.heightIn - margin - h),
    w,
    h,
  };
}
