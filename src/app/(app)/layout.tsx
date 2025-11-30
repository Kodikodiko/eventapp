import type { ReactNode } from 'react';
import { SidebarProvider, Sidebar, SidebarInset } from '@/components/ui/sidebar';
import { Header } from '@/components/layout/header';
import { MainNav } from '@/components/layout/main-nav';
import imageData from '@/lib/placeholder-images.json';

export default function AppLayout({ children }: { children: ReactNode }) {
  const avatarUrl = imageData.placeholderImages.find(img => img.id === 'user-avatar')?.imageUrl ?? '';
  
  return (
    <SidebarProvider>
      <Sidebar>
        <MainNav />
      </Sidebar>
      <SidebarInset>
        <Header avatarUrl={avatarUrl} />
        <main className="flex-1 overflow-y-auto p-4 md:p-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
