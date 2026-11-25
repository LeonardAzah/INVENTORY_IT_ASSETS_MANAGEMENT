'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Toaster } from 'react-hot-toast';

import { createQueryClient } from '@/lib/query/client';

export function Providers({ children }: { children: React.ReactNode }) {
  // One client per browser session; useState keeps it across re-renders.
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 5000,
          className: 'text-sm',
          style: {
            background: 'var(--card)',
            color: 'var(--foreground)',
            border: '1px solid var(--border)',
            maxWidth: 'min(24rem, calc(100vw - 2rem))',
          },
          success: {
            iconTheme: {
              primary: 'var(--color-success-700)',
              secondary: '#ffffff',
            },
          },
          error: {
            iconTheme: {
              primary: 'var(--color-error-700)',
              secondary: '#ffffff',
            },
          },
        }}
      />
    </QueryClientProvider>
  );
}
