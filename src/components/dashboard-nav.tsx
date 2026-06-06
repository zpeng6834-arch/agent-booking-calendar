'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Calendar,
  Briefcase,
  CalendarDays,
  Key,
  Menu,
  LogOut,
  User,
  Home,
  FileCode,
  type LucideIcon,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: '概览', icon: Home },
  { href: '/dashboard/calendars', label: '日历管理', icon: Calendar },
  { href: '/dashboard/services', label: '服务管理', icon: Briefcase },
  { href: '/dashboard/bookings', label: '预约管理', icon: CalendarDays },
  { href: '/dashboard/api-keys', label: 'API 密钥', icon: Key },
  { href: '/dashboard/api-docs', label: 'API 文档', icon: FileCode },
];

interface NavLinkProps extends NavItem {
  onNavigate?: () => void;
}

function NavLink({ href, label, icon: Icon, onNavigate }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(href + '/');
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
        isActive
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {navItems.map((item) => (
        <NavLink key={item.href} {...item} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}

export function DashboardNav() {
  const { user, signOut } = useAuth();
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const userInitial = user?.email?.[0]?.toUpperCase() || 'U';

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 md:left-0 md:border-r md:bg-card">
        <div className="flex flex-col flex-1 p-4">
          <div className="flex items-center gap-2 mb-8 px-3">
            <Calendar className="h-6 w-6 text-primary" />
            <span className="font-semibold text-lg">预约日历</span>
          </div>
          <NavContent />
        </div>
        
        {/* User section */}
        <div className="p-4 border-t">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-full justify-start gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>{userInitial}</AvatarFallback>
                </Avatar>
                <span className="truncate flex-1 text-left">
                  {user?.email || '用户'}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem disabled>
                <User className="mr-2 h-4 w-4" />
                {user?.email}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => setShowLogoutDialog(true)}
              >
                <LogOut className="mr-2 h-4 w-4" />
                退出登录
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-14 border-b bg-card z-50 flex items-center px-4">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-4">
            <div className="flex items-center gap-2 mb-8">
              <Calendar className="h-6 w-6 text-primary" />
              <span className="font-semibold text-lg">预约日历</span>
            </div>
            <NavContent onNavigate={() => setMobileOpen(false)} />
            <div className="mt-8 pt-4 border-t">
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 text-destructive"
                onClick={() => {
                  setMobileOpen(false);
                  setShowLogoutDialog(true);
                }}
              >
                <LogOut className="h-4 w-4" />
                退出登录
              </Button>
            </div>
          </SheetContent>
        </Sheet>
        <span className="ml-4 font-medium">预约日历</span>
      </header>

      {/* Logout Confirmation Dialog */}
      <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认退出登录？</AlertDialogTitle>
            <AlertDialogDescription>
              退出后需要重新登录才能访问您的数据。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await signOut();
                setShowLogoutDialog(false);
              }}
            >
              确认退出
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
