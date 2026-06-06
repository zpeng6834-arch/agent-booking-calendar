'use client';

import { ReactNode } from 'react';
import { DashboardNav } from '@/components/dashboard-nav';

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <DashboardNav />
      <main className="md:pl-64 pt-14 md:pt-0">
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
