'use client';

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { focusRing } from '@/components/expert-prereg/styles';

interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

/** The WAI-ARIA tabs pattern: one tab stop, arrow keys wrap, Home and End jump, focus activates. */
export function Tabs({ label, items }: { label: string; items: TabItem[] }) {
  const baseId = useId();
  const [activeId, setActiveId] = useState(items[0]?.id);
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const activeIndex = items.findIndex((item) => item.id === activeId);
  const active = items[activeIndex];

  function onKeyDown(event: KeyboardEvent) {
    const last = items.length - 1;
    const targets: Record<string, number> = {
      ArrowRight: activeIndex === last ? 0 : activeIndex + 1,
      ArrowLeft: activeIndex === 0 ? last : activeIndex - 1,
      Home: 0,
      End: last,
    };
    const next = items[targets[event.key] ?? -1];
    if (!next) return;
    event.preventDefault();
    setActiveId(next.id);
    refs.current.get(next.id)?.focus();
  }

  return (
    <div>
      <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex flex-wrap gap-2 border-b border-border">
        {items.map((item) => {
          const selected = item.id === activeId;
          return (
            <button
              key={item.id}
              ref={(node) => {
                if (node) refs.current.set(item.id, node);
                else refs.current.delete(item.id);
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveId(item.id)}
              className={`min-h-11 cursor-pointer border-b-2 px-4 text-sm transition-colors ${selected ? 'border-accent-ink font-semibold text-accent-ink' : 'border-transparent font-medium text-muted hover:text-ink'} ${focusRing}`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {active && (
        <div
          role="tabpanel"
          id={`${baseId}-panel-${active.id}`}
          aria-labelledby={`${baseId}-tab-${active.id}`}
          tabIndex={0}
          className={`pt-4 text-sm text-ink ${focusRing}`}
        >
          {active.content}
        </div>
      )}
    </div>
  );
}
