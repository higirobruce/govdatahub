import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'DataGate - Multi-Database Integration Platform',
  description:
    'DataGate is a powerful data integration platform that connects to multiple databases (PostgreSQL, MySQL), enables SQL queries, cross-database joins, and provides data transformation pipelines.',
  keywords:
    'data integration, database management, SQL query, PostgreSQL, MySQL, cross-database joins, data transformation, ETL',
  authors: [{ name: 'DataGate' }],
  icons: { icon: '/Coat_of_arms_of_Rwanda.svg' },
  manifest: '/site.webmanifest',
  openGraph: {
    type: 'website',
    title: 'DataGate - Multi-Database Integration Platform',
    description:
      "Connect, query, and transform data across multiple databases with DataGate's powerful integration platform.",
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DataGate - Multi-Database Integration Platform',
    description:
      "Connect, query, and transform data across multiple databases with DataGate's powerful integration platform.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
