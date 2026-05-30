import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Blinks United',
  description: 'BLACKPINK streaming campaign tracker',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
