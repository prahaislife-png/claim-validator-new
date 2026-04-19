import type { AppProps } from 'next/app';
import { Analytics } from '@vercel/analytics/next';
import { AuthProvider } from '@/lib/auth';
import '@/styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <AuthProvider>
      <Component {...pageProps} />
      <Analytics />
    </AuthProvider>
  );
}
