'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/new', label: 'New check' },
  { href: '/settings', label: 'Settings' },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex items-center gap-1 text-sm">
      {LINKS.map(({ href, label }) => {
        const active = pathname === href || (href === '/dashboard' && pathname.startsWith('/cases/'));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-lg px-2.5 py-1.5 ${active ? 'bg-brand-soft font-semibold text-brand' : 'hover:bg-brand-soft'}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
