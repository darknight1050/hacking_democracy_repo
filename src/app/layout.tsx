import type { Metadata } from 'next';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import '../client/styles.css';
import '../client/redesign.css';
import { themeBootstrap } from '@/client/theme';
export const metadata: Metadata = {
  title: 'Common Ground · Shape your city',
  description:
    'Propose an idea, discover local projects, and help decide what comes next for your district.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
