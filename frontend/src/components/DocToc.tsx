import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

interface DocTocItem {
  id: string;
  label: string;
}

interface DocTocProps {
  items: DocTocItem[];
  ctaText: string;
  ctaLabel: string;
  ctaTo: string;
}

export function DocToc({ items, ctaText, ctaLabel, ctaTo }: DocTocProps) {
  const { hash } = useLocation();
  const [activeId, setActiveId] = useState(items[0]?.id ?? '');

  // Deep links such as /docs#troubleshooting need to wait for the page to render.
  useEffect(() => {
    if (!hash) return;
    const target = document.getElementById(hash.replace('#', ''));
    if (!target) return;

    const timer = window.setTimeout(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [hash]);

  // Highlight the section currently in view.
  useEffect(() => {
    const sections = items
      .map((item) => document.getElementById(item.id))
      .filter((element): element is HTMLElement => Boolean(element));

    if (!sections.length || typeof IntersectionObserver === 'undefined') {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        if (visible[0]) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: '-12% 0px -68% 0px', threshold: [0.1, 0.4, 0.8] }
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [items]);

  return (
    <aside className="doc-toc" aria-label="On this page">
      <span className="doc-toc-title">On this page</span>
      <nav>
        {items.map((item) => {
          const isActive = activeId === item.id;
          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={isActive ? 'is-active' : undefined}
              aria-current={isActive ? 'location' : undefined}
            >
              {item.label}
            </a>
          );
        })}
      </nav>
      <div className="doc-toc-cta">
        <span>{ctaText}</span>
        <Link to={ctaTo} className="btn btn-primary">
          {ctaLabel}
        </Link>
      </div>
    </aside>
  );
}
