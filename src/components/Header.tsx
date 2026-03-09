'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface HeaderProps {
  showNavigation?: boolean;
}

export default function Header({ showNavigation = true }: HeaderProps) {
  const pathname = usePathname();

  return (
    <header className="border-b border-gray-200 bg-white sticky top-0 z-[100] shadow-sm">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo / Brand */}
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="h-8 w-1 bg-blue-600 rounded-full"></div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">
              PageWise™
            </h1>
          </Link>

          {/* Navigation */}
          {showNavigation && (
            <nav className="flex items-center gap-4">
              <Link
                href="/"
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pathname === '/'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                Upload
              </Link>
              <Link
                href="/admin"
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pathname.startsWith('/admin')
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                Admin Dashboard
              </Link>
            </nav>
          )}
        </div>
      </div>
    </header>
  );
}
