'use client'
import { Toaster } from '@/components/shadcn/ui/toaster';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function Providers(
  { children }: { children: React.ReactNode }
) {
  // Create QueryClient per component instance to avoid cross-request state leaks in SSR
  const [queryClient] = useState(() => new QueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
