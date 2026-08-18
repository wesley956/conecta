import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

type Props<T> = {
  items: T[];
  getKey: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
  className?: string;
  minCardWidth?: number;
  maxCardWidth?: number;
  gap?: number;
  cardAspectRatio?: number;
  cardFooterHeight?: number;
  overscanRows?: number;
};

type Layout = {
  width: number;
  columns: number;
  cardWidth: number;
  rowHeight: number;
};

const EMPTY_LAYOUT: Layout = { width: 0, columns: 1, cardWidth: 160, rowHeight: 310 };

export function VirtualCatalogGrid<T>({
  items,
  getKey,
  renderItem,
  className = '',
  minCardWidth = 142,
  maxCardWidth = 196,
  gap = 14,
  cardAspectRatio = 1.5,
  cardFooterHeight = 58,
  overscanRows = 3,
}: Props<T>) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<Layout>(EMPTY_LAYOUT);
  const [visibleRows, setVisibleRows] = useState({ start: 0, end: 8 });

  const measure = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const width = host.clientWidth;
    if (!width) return;
    const possibleColumns = Math.max(1, Math.floor((width + gap) / (minCardWidth + gap)));
    const columnsByMax = Math.max(1, Math.ceil((width + gap) / (maxCardWidth + gap)));
    const columns = Math.max(columnsByMax, possibleColumns);
    const cardWidth = Math.max(minCardWidth, Math.min(maxCardWidth, (width - gap * (columns - 1)) / columns));
    const rowHeight = cardWidth * cardAspectRatio + cardFooterHeight + gap;
    setLayout(current => (
      current.width === width && current.columns === columns && Math.abs(current.cardWidth - cardWidth) < .5
        ? current
        : { width, columns, cardWidth, rowHeight }
    ));
  }, [cardAspectRatio, cardFooterHeight, gap, maxCardWidth, minCardWidth]);

  useEffect(() => {
    measure();
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [measure]);

  const totalRows = Math.ceil(items.length / Math.max(1, layout.columns));
  const totalHeight = Math.max(0, totalRows * layout.rowHeight - gap);

  const updateWindow = useCallback(() => {
    const host = hostRef.current;
    if (!host || !layout.rowHeight) return;
    const rect = host.getBoundingClientRect();
    const topInside = Math.max(0, -rect.top);
    const bottomInside = Math.min(totalHeight, topInside + window.innerHeight);
    const start = Math.max(0, Math.floor(topInside / layout.rowHeight) - overscanRows);
    const end = Math.min(totalRows, Math.ceil(bottomInside / layout.rowHeight) + overscanRows);
    setVisibleRows(current => current.start === start && current.end === end ? current : { start, end });
  }, [layout.rowHeight, overscanRows, totalHeight, totalRows]);

  useEffect(() => {
    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        updateWindow();
      });
    };
    updateWindow();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [updateWindow]);

  useEffect(() => updateWindow(), [items.length, layout.columns, updateWindow]);

  const visibleItems = useMemo(() => {
    if (!items.length) return [];
    const startIndex = visibleRows.start * layout.columns;
    const endIndex = Math.min(items.length, visibleRows.end * layout.columns);
    return items.slice(startIndex, endIndex).map((item, offset) => ({ item, index: startIndex + offset }));
  }, [items, layout.columns, visibleRows.end, visibleRows.start]);

  return (
    <div
      ref={hostRef}
      className={`virtual-catalog-grid ${className}`.trim()}
      style={{ height: totalHeight || undefined }}
      data-total-items={items.length}
      data-rendered-items={visibleItems.length}
    >
      {visibleItems.map(({ item, index }) => {
        const row = Math.floor(index / layout.columns);
        const column = index % layout.columns;
        return (
          <div
            key={getKey(item)}
            className="virtual-catalog-cell"
            style={{
              width: layout.cardWidth,
              transform: `translate3d(${column * (layout.cardWidth + gap)}px, ${row * layout.rowHeight}px, 0)`,
            }}
          >
            {renderItem(item, index)}
          </div>
        );
      })}
    </div>
  );
}
