"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Award,
  BarChart2,
  Calendar,
  LayoutDashboard,
  Mic,
  Settings,
  Users,
} from 'lucide-react';
import {
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
} from '@/components/ui/sidebar';

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/attendees', icon: Users, label: 'Attendees' },
  { href: '/speakers', icon: Mic, label: 'Speakers' },
  { href: '/sponsors', icon: Award, label: 'Sponsors' },
  { href: '/schedule', icon: Calendar, label: 'Schedule' },
  { href: '/reporting', icon: BarChart2, label: 'Reporting' },
];

export function MainNav() {
  const pathname = usePathname();

  return (
    <>
      <SidebarHeader>
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-primary"><path d="M12 2l-5.5 9h11L12 2zM3 22l5.5-9h6.5l5.5 9H3z"/></svg>
          <span className="text-lg">EventFlow</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {navItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                isActive={pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))}
                tooltip={{children: item.label}}
              >
                <Link href={item.href}>
                  <item.icon />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname === '/settings'} tooltip={{children: 'Settings'}}>
              {/* Using '#' as a placeholder for settings page */}
              <Link href="#">
                <Settings />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </>
  );
}
