'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { UserMenu } from '@/components/UserMenu';
import {
  Home,
  Database,
  FileText,
  Upload,
  Search,
  GitBranch,
  Settings,
  HelpCircle,
  Link as LinkIcon,
  Menu,
  X,
  BarChart3,
  LayoutDashboard,
  Network,
  BookOpen,
} from 'lucide-react';

interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ReactNode;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export function Sidebar() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navSections: NavSection[] = [
    {
      title: 'OVERVIEW',
      items: [
        { id: 'dashboard', label: 'Dashboard', href: '/', icon: <Home /> },
      ],
    },
    {
      title: 'DATA SOURCES',
      items: [
        { id: 'connections', label: 'Connections', href: '/connections', icon: <Database /> },
        { id: 'staged', label: 'Staged Data', href: '/staged', icon: <FileText /> },
        { id: 'ingestion', label: 'Data Ingestion', href: '/ingestion', icon: <Upload /> },
      ],
    },
    {
      title: 'QUERY TOOLS',
      items: [
        { id: 'query', label: 'SQL Query', href: '/query', icon: <Search /> },
        { id: 'cross-query', label: 'Cross-Query', href: '/cross-query', icon: <LinkIcon /> },
        { id: 'notebooks', label: 'Notebooks', href: '/notebooks', icon: <BookOpen /> },
      ],
    },
    {
      title: 'ANALYTICS',
      items: [
        // { id: 'charts', label: 'Charts', href: '/charts', icon: <BarChart3 /> },
        { id: 'dashboards', label: 'Dashboard Builder', href: '/dashboards', icon: <LayoutDashboard /> },
      ],
    },
    {
      title: 'DATA OPERATIONS',
      items: [
        { id: 'transformations', label: 'Transformations', href: '/transformations', icon: <GitBranch /> },
        { id: 'lineage', label: 'Data Lineage', href: '/lineage', icon: <Network /> },
      ],
    },
  ];

  const bottomNavItems: NavItem[] = [
    { id: 'settings', label: 'Settings', href: '/settings', icon: <Settings /> },
    { id: 'support', label: 'Support', href: '/support', icon: <HelpCircle /> },
  ];

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <>
      {/* Mobile Menu Button - Only visible on mobile */}
      <button
        onClick={() => setIsMobileMenuOpen(true)}
        className="md:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-md shadow-card"
        aria-label="Open menu"
      >
        <Menu className="w-6 h-6 text-[#1a1a1a]" />
      </button>

      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/20 z-40"
          onClick={closeMobileMenu}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'w-[260px] h-screen bg-white py-5 flex flex-col flex-shrink-0',
          // Mobile styles
          'md:relative md:translate-x-0',
          isMobileMenuOpen
            ? 'fixed top-0 left-0 bottom-0 z-50 translate-x-0'
            : 'max-md:fixed max-md:top-0 max-md:left-0 max-md:bottom-0 max-md:z-50 max-md:-translate-x-full'
        )}
      >
        {/* Mobile Close Button */}
        <button
          onClick={closeMobileMenu}
          className="md:hidden absolute top-4 right-4 p-1 hover:bg-[#f5f5f5] rounded-md transition-colors"
          aria-label="Close menu"
        >
          <X className="w-5 h-5 text-[#555555]" />
        </button>

        {/* Brand */}
        <div className="flex items-center gap-2.5 px-4.5 pb-5 font-semibold text-[15px] border-b border-[#f0f0f0]">
          <img
            src="/Coat_of_arms_of_Rwanda.svg"
            alt="Rwanda Coat of Arms"
            className="w-8 h-8"
          />
          DataGate
        </div>

      {/* Main Navigation */}
      <nav className="px-2.5 py-3.5 flex-1 overflow-y-auto">
        {navSections.map((section, sectionIdx) => (
          <div key={section.title} className={sectionIdx > 0 ? 'mt-4' : ''}>
            {/* Section Header */}
            <div className="px-2.5 py-1.5 text-[10px] font-bold text-[#999999] tracking-wider">
              {section.title}
            </div>

            {/* Section Items */}
            <div className="mt-1">
              {section.items.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={closeMobileMenu}
                  className={cn(
                    'flex items-center gap-2.5 px-2.5 py-2 rounded-md transition-colors text-md mb-0.5',
                    isActive(item.href)
                      ? 'bg-[#f0f0f0] text-[#1a1a1a] font-medium'
                      : 'text-[#555555] hover:bg-[#f5f5f5]'
                  )}
                >
                  <span className="w-4 h-4 flex items-center justify-center [&>svg]:w-4 [&>svg]:h-4 [&>svg]:stroke-current [&>svg]:stroke-[1.7]">
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom Navigation */}
      <div className="px-2.5 pt-3.5 border-t border-[#f0f0f0]">
        {bottomNavItems.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            onClick={closeMobileMenu}
            className={cn(
              'flex items-center gap-2.5 px-2.5 py-2 rounded-md transition-colors text-md mb-0.5',
              isActive(item.href)
                ? 'bg-[#f0f0f0] text-[#1a1a1a] font-medium'
                : 'text-[#555555] hover:bg-[#f5f5f5]'
            )}
          >
            <span className="w-4 h-4 flex items-center justify-center [&>svg]:w-4 [&>svg]:h-4 [&>svg]:stroke-current [&>svg]:stroke-[1.7]">
              {item.icon}
            </span>
            {item.label}
          </Link>
        ))}

        {/* User Profile Section */}
        <div className="mt-3 pt-3 border-t border-[#f0f0f0]">
          <UserMenu />
        </div>
      </div>
      </aside>
    </>
  );
}
