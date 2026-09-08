import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Common Ground · Shape your city',
  description:
    'Propose an idea, discover local projects, and help decide what comes next for your district.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
