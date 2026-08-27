import Link from "next/link";

export type Crumb = { label: string; href?: string };

/**
 * Breadcrumb trail. The last item is rendered as the current page
 * (`aria-current="page"`, no link) by convention. Items before the
 * last link back up the trail. Used on dashboard nested pages,
 * not on home or auth pages.
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="breadcrumbs">
      <ol>
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          if (isLast || !item.href) {
            return (
              <li key={i}>
                <span aria-current="page">{item.label}</span>
              </li>
            );
          }
          return (
            <li key={i}>
              <Link href={item.href}>{item.label}</Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
