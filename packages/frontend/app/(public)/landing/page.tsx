'use client';

import Link from 'next/link';
import {
  Database,
  Zap,
  Lock,
  GitBranch,
  Code,
  BarChart3,
  ArrowRight,
  Check,
  Terminal,
  Workflow,
  Users,
  Globe,
  Shield,
  TrendingUp,
  Link2,
  FileJson,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#e8e8e8]">
      {/* Navigation */}
      <nav className="bg-white border-b border-[#e8e8e8]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src="/Coat_of_arms_of_Rwanda.svg"
              alt="Rwanda Coat of Arms"
              className="w-8 h-8"
            />
            <span className="font-semibold text-[17px] text-[#1a1a1a]">DataGate</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost" size="sm">Sign In</Button>
            </Link>
            <Link href="/register">
              <Button size="sm" className="bg-[#1a1a1a] hover:bg-[#2a2a2a]">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-[#e8e8e8] rounded-full text-[13px] text-[#555555] mb-6">
            <Zap className="w-3.5 h-3.5 text-[#fb923c]" />
            Unified Data Platform for Engineering Teams
          </div>

          <h1 className="text-[52px] font-bold text-[#1a1a1a] leading-tight mb-6">
            Build Data Pipelines,
            <br />
            <span className="text-[#555555]">Share Insights, Monitor Quality</span>
          </h1>

          <p className="text-[17px] text-[#555555] leading-relaxed mb-10 max-w-3xl mx-auto">
            DataGate empowers data teams to create datasets, build SQL-based transformation pipelines,
            share data via APIs, and monitor data quality with comprehensive analytics dashboards.
          </p>

          <div className="flex items-center justify-center gap-4">
            <Link href="/register">
              <Button size="lg" className="bg-[#1a1a1a] hover:bg-[#2a2a2a] h-12 px-8 text-[15px]">
                Start Building
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
            <a href="#features">
              <Button variant="outline" size="lg" className="h-12 px-8 text-[15px]">
                Explore Features
              </Button>
            </a>
          </div>

          {/* Hero Code Example */}
          <div className="mt-16 bg-white rounded-xl border border-[#e8e8e8] p-6 text-left shadow-card">
            <div className="flex items-center gap-2 mb-4">
              <GitBranch className="w-4 h-4 text-[#555555]" />
              <span className="text-[13px] font-medium text-[#555555]">Data Transformation Pipeline Example</span>
            </div>
            <pre className="text-[13px] font-mono text-[#1a1a1a] leading-relaxed overflow-x-auto">
{`-- Daily user activity aggregation
CREATE TRANSFORMATION daily_user_stats AS
SELECT
  DATE(created_at) as activity_date,
  user_id,
  COUNT(*) as total_actions,
  COUNT(DISTINCT session_id) as sessions,
  SUM(duration_seconds) as total_duration
FROM user_events
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(created_at), user_id
ORDER BY activity_date DESC, total_actions DESC;

-- Schedule: Run daily at 2 AM
-- Output: Cached results + API endpoint`}
            </pre>
          </div>
        </div>
      </section>

      {/* Key Features */}
      <section id="features" className="bg-white py-20 border-y border-[#e8e8e8]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-[36px] font-bold text-[#1a1a1a] mb-4">
              Complete Data Engineering Platform
            </h2>
            <p className="text-[17px] text-[#555555] max-w-2xl mx-auto">
              Create datasets, build transformation pipelines, share via APIs, and monitor data quality—all in one platform
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={<Workflow className="w-6 h-6" />}
              title="Data Transformation Pipelines"
              description="Build SQL-based ETL pipelines with automatic execution, history tracking, and configurable retention policies"
              color="orange"
            />
            <FeatureCard
              icon={<BarChart3 className="w-6 h-6" />}
              title="Real-Time Analytics"
              description="Monitor query performance, data freshness, connection health, and dataset usage with interactive dashboards"
              color="green"
            />
            <FeatureCard
              icon={<Globe className="w-6 h-6" />}
              title="Dataset Sharing APIs"
              description="Share datasets as REST APIs with authentication, rate limiting, and access tracking for external consumption"
              color="blue"
            />
            <FeatureCard
              icon={<Database className="w-6 h-6" />}
              title="Multi-Database Management"
              description="Connect to unlimited PostgreSQL and MySQL databases with encrypted credential storage and connection pooling"
              color="green"
            />
            <FeatureCard
              icon={<Code className="w-6 h-6" />}
              title="SQL Query Interface"
              description="Monaco editor with syntax highlighting, IntelliSense, and cross-database query support via Foreign Data Wrappers"
              color="blue"
            />
            <FeatureCard
              icon={<Lock className="w-6 h-6" />}
              title="Enterprise Security"
              description="AES-256-GCM encryption, JWT authentication, organization isolation, and comprehensive audit logs"
              color="red"
            />
          </div>
        </div>
      </section>

      {/* Technical Specs */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-[36px] font-bold text-[#1a1a1a] mb-6">
                Powerful Technology Stack
              </h2>
              <p className="text-[17px] text-[#555555] mb-8">
                DataGate is built on modern, production-ready technologies that scale with your organization.
              </p>

              <div className="space-y-6">
                <TechSpec
                  icon={<Workflow className="w-5 h-5" />}
                  title="Automated Pipelines"
                  description="SQL-based transformations with automatic execution, retention policies, and failure tracking"
                />
                <TechSpec
                  icon={<BarChart3 className="w-5 h-5" />}
                  title="Live Analytics"
                  description="Real-time dashboards with query performance metrics, data freshness monitoring, and CSV/PDF exports"
                />
                <TechSpec
                  icon={<Globe className="w-5 h-5" />}
                  title="API-First Design"
                  description="Share datasets as REST APIs with authentication, comprehensive Swagger documentation, and access tracking"
                />
                <TechSpec
                  icon={<Shield className="w-5 h-5" />}
                  title="Enterprise Ready"
                  description="Multi-tenant architecture, AES-256 encryption, JWT authentication, and organization isolation"
                />
              </div>
            </div>

            <div className="bg-white rounded-xl border border-[#e8e8e8] p-8 shadow-card">
              <h3 className="text-[15px] font-semibold text-[#1a1a1a] mb-6">Technology Stack</h3>

              <div className="space-y-6">
                <div>
                  <div className="text-[13px] text-[#555555] mb-2">Backend</div>
                  <div className="flex flex-wrap gap-2">
                    <TechBadge>NestJS 11</TechBadge>
                    <TechBadge>TypeORM</TechBadge>
                    <TechBadge>PostgreSQL</TechBadge>
                    <TechBadge>MySQL2</TechBadge>
                    <TechBadge>JWT</TechBadge>
                  </div>
                </div>

                <div>
                  <div className="text-[13px] text-[#555555] mb-2">Frontend</div>
                  <div className="flex flex-wrap gap-2">
                    <TechBadge>Next.js 14</TechBadge>
                    <TechBadge>React 18</TechBadge>
                    <TechBadge>TypeScript</TechBadge>
                    <TechBadge>Tailwind CSS</TechBadge>
                    <TechBadge>SWR</TechBadge>
                  </div>
                </div>

                <div>
                  <div className="text-[13px] text-[#555555] mb-2">Features</div>
                  <div className="flex flex-wrap gap-2">
                    <TechBadge>FDW</TechBadge>
                    <TechBadge>React Flow</TechBadge>
                    <TechBadge>Monaco Editor</TechBadge>
                    <TechBadge>AES-256-GCM</TechBadge>
                  </div>
                </div>

                <div>
                  <div className="text-[13px] text-[#555555] mb-2">DevOps</div>
                  <div className="flex flex-wrap gap-2">
                    <TechBadge>Docker</TechBadge>
                    <TechBadge>pnpm</TechBadge>
                    <TechBadge>OpenAPI</TechBadge>
                    <TechBadge>ESLint</TechBadge>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="bg-white py-20 border-y border-[#e8e8e8]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-[36px] font-bold text-[#1a1a1a] mb-4">
              Built For Your Workflow
            </h2>
            <p className="text-[17px] text-[#555555] max-w-2xl mx-auto">
              DataGate adapts to different technical roles and use cases
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <UseCaseCard
              icon={<Users className="w-6 h-6" />}
              title="Data Engineers"
              items={[
                "Build SQL transformation pipelines",
                "Automate data quality checks",
                "Monitor pipeline health",
                "Track transformation history"
              ]}
            />
            <UseCaseCard
              icon={<Database className="w-6 h-6" />}
              title="Database Admins"
              items={[
                "Centralize database management",
                "Monitor connection health",
                "Track query performance",
                "Secure credential storage"
              ]}
            />
            <UseCaseCard
              icon={<BarChart3 className="w-6 h-6" />}
              title="Data Analysts"
              items={[
                "Create analytics dashboards",
                "Export insights to CSV/PDF",
                "Schedule recurring reports",
                "Monitor data freshness"
              ]}
            />
            <UseCaseCard
              icon={<Globe className="w-6 h-6" />}
              title="Data Owners"
              items={[
                "Share datasets as APIs",
                "Control data access",
                "Track API usage",
                "Organization-level isolation"
              ]}
            />
          </div>
        </div>
      </section>

      {/* Key Metrics */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="bg-gradient-to-br from-[#1a1a1a] to-[#2a2a2a] rounded-2xl p-12 text-white">
            <div className="text-center mb-12">
              <h2 className="text-[36px] font-bold mb-4">
                Built for Production Workloads
              </h2>
              <p className="text-[17px] text-white/70 max-w-2xl mx-auto">
                Reliable, secure, and scalable for mission-critical data operations
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              <MetricCard value="Unlimited" label="Transformation Pipelines" />
              <MetricCard value="Real-Time" label="Analytics Dashboards" />
              <MetricCard value="REST API" label="Dataset Sharing" />
              <MetricCard value="AES-256" label="Data Encryption" />
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="bg-white py-20 border-y border-[#e8e8e8]">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-[28px] font-bold text-[#1a1a1a] mb-12 text-center">
            Everything You Need
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-6">
            <FeatureListItem text="SQL-based transformation pipelines" />
            <FeatureListItem text="Real-time analytics dashboards" />
            <FeatureListItem text="Dataset sharing via REST API" />
            <FeatureListItem text="Data freshness monitoring" />
            <FeatureListItem text="CSV & PDF export functionality" />
            <FeatureListItem text="Query performance tracking" />
            <FeatureListItem text="Connection health monitoring" />
            <FeatureListItem text="Automated data quality checks" />
            <FeatureListItem text="PostgreSQL & MySQL support" />
            <FeatureListItem text="Cross-database query capability" />
            <FeatureListItem text="Monaco SQL editor with IntelliSense" />
            <FeatureListItem text="Organization multi-tenancy" />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-[42px] font-bold text-[#1a1a1a] mb-6">
            Ready to Transform Your Data Workflow?
          </h2>
          <p className="text-[17px] text-[#555555] mb-10 max-w-2xl mx-auto">
            Join data teams building automated pipelines, sharing datasets via APIs, and monitoring data quality with DataGate.
            Get up and running in minutes with Docker Compose.
          </p>

          <div className="flex items-center justify-center gap-4 mb-12">
            <Link href="/register">
              <Button size="lg" className="bg-[#1a1a1a] hover:bg-[#2a2a2a] h-14 px-10 text-[16px]">
                Create Free Account
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg" className="h-14 px-10 text-[16px]">
                Sign In
              </Button>
            </Link>
          </div>

          <div className="inline-flex items-center gap-2 text-[13px] text-[#aaaaaa]">
            <Terminal className="w-4 h-4" />
            <code className="font-mono">
              git clone && cd datagate && bash scripts/setup.sh
            </code>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-[#e8e8e8] py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-[#1a1a1a] rounded-md flex items-center justify-center text-white text-lg font-semibold">
                DG
              </div>
              <span className="font-semibold text-[15px] text-[#1a1a1a]">DataGate</span>
            </div>
            <div className="text-[13px] text-[#aaaaaa]">
              © 2024 DataGate. Built with ❤️ for Multi-Database Integration.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Component Helpers

function FeatureCard({
  icon,
  title,
  description,
  color
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: 'blue' | 'green' | 'orange' | 'red';
}) {
  const colorMap = {
    blue: 'text-[#60a5fa] bg-[#eff6ff]',
    green: 'text-[#4ade80] bg-[#f0fdf4]',
    orange: 'text-[#fb923c] bg-[#fff7ed]',
    red: 'text-[#ef4444] bg-[#fef2f2]',
  };

  return (
    <div className="bg-white rounded-xl border border-[#e8e8e8] p-6 hover:border-[#dddddd] transition-colors">
      <div className={`w-12 h-12 rounded-lg ${colorMap[color]} flex items-center justify-center mb-4`}>
        {icon}
      </div>
      <h3 className="text-[17px] font-semibold text-[#1a1a1a] mb-2">{title}</h3>
      <p className="text-[15px] text-[#555555] leading-relaxed">{description}</p>
    </div>
  );
}

function TechSpec({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex gap-4">
      <div className="w-10 h-10 rounded-lg bg-[#f5f5f5] flex items-center justify-center flex-shrink-0 text-[#555555]">
        {icon}
      </div>
      <div>
        <h4 className="text-[15px] font-semibold text-[#1a1a1a] mb-1">{title}</h4>
        <p className="text-[15px] text-[#555555]">{description}</p>
      </div>
    </div>
  );
}

function TechBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2.5 py-1 bg-[#f5f5f5] text-[#555555] text-[13px] rounded-md font-medium">
      {children}
    </span>
  );
}

function UseCaseCard({ icon, title, items }: { icon: React.ReactNode; title: string; items: string[] }) {
  return (
    <div className="bg-white rounded-xl border border-[#e8e8e8] p-6">
      <div className="w-12 h-12 rounded-lg bg-[#f5f5f5] flex items-center justify-center mb-4 text-[#555555]">
        {icon}
      </div>
      <h3 className="text-[17px] font-semibold text-[#1a1a1a] mb-4">{title}</h3>
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li key={index} className="flex items-start gap-2 text-[15px] text-[#555555]">
            <Check className="w-4 h-4 text-[#4ade80] mt-0.5 flex-shrink-0" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MetricCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-[42px] font-bold mb-2">{value}</div>
      <div className="text-[15px] text-white/70">{label}</div>
    </div>
  );
}

function FeatureListItem({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3">
      <Check className="w-5 h-5 text-[#4ade80] flex-shrink-0" />
      <span className="text-[15px] text-[#555555]">{text}</span>
    </div>
  );
}
