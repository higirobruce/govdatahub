'use client';

import { PageHeader } from '@/components/ui/page-header';
import { HelpCircle, BookOpen, FileCode2, Bug } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const resources = [
  {
    icon: FileCode2,
    title: 'API Documentation',
    description: 'Interactive Swagger reference for every DataGate API endpoint.',
    href: `${API_BASE}/api/docs`,
    external: true,
  },
  {
    icon: BookOpen,
    title: 'Product Guides',
    description: 'Reference docs for dashboards, charts, and the visualization roadmap (docs/ in the repository).',
    href: 'https://github.com/higirobruce/govdatahub/tree/main/docs',
    external: true,
  },
  {
    icon: Bug,
    title: 'Report an Issue',
    description: 'Found a bug or have a feature request? Open an issue on the repository.',
    href: 'https://github.com/higirobruce/govdatahub/issues',
    external: true,
  },
];

export default function SupportPage() {
  return (
    <div className="w-full max-w-4xl">
      <PageHeader
        title="Support"
        subtitle="Documentation and help resources for DataGate"
        icon={HelpCircle}
      />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {resources.map(({ icon: Icon, title, description, href, external }) => (
          <a
            key={title}
            href={href}
            target={external ? '_blank' : undefined}
            rel={external ? 'noopener noreferrer' : undefined}
            className="block bg-white rounded-xl border border-[#e8e8e8] shadow-card p-5 hover:border-[#60a5fa] transition-colors"
          >
            <div className="w-10 h-10 bg-[#eff6ff] rounded-lg flex items-center justify-center mb-3">
              <Icon className="w-5 h-5 text-[#60a5fa]" />
            </div>
            <h3 className="text-[15px] font-semibold text-[#1a1a1a] mb-1">{title}</h3>
            <p className="text-xs text-[#aaaaaa]">{description}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
