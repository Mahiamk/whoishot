import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import {
  AtSign,
  BarChart3,
  DollarSign,
  Flag,
  Handshake,
  LogOut,
  ScrollText,
  Trophy,
  Users as UsersIcon,
  Wallet,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/context/AuthContext'

const NAV = [
  { to: '/admin', label: 'Overview', icon: BarChart3, end: true },
  { to: '/admin/partner-inquiries', label: 'Partner inquiries', icon: Handshake, end: false },
  { to: '/admin/reports', label: 'Reports', icon: Flag, end: false },
  { to: '/admin/income', label: 'Total Income', icon: Wallet, end: false },
  { to: '/admin/payment-reviews', label: 'Payment reviews', icon: DollarSign, end: false },
  { to: '/admin/users', label: 'Users', icon: UsersIcon, end: false },
  { to: '/admin/contests', label: 'Contests', icon: Trophy, end: false },
  { to: '/admin/payouts', label: 'Payouts', icon: DollarSign, end: false },
  { to: '/admin/email-domains', label: 'Email domains', icon: AtSign, end: false },
  { to: '/admin/audit-log', label: 'Audit Log', icon: ScrollText, end: false },
]

export default function AdminLayout() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="w-full max-w-md space-y-3 px-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      </div>
    )
  }

  // Client-side gate is UX only — real enforcement is the backend's
  // require_admin dependency (403 on every /admin/* route). Also treat a
  // banned account as unauthorized even if it somehow held admin, since
  // banned users must be rejected everywhere per SPEC.
  if (!user || user.role !== 'admin' || user.is_banned) {
    return <Navigate to="/" replace />
  }

  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader className="overflow-hidden px-3 py-3">
            <div className="flex items-center gap-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground shadow-sm">
                W
              </span>
              <span className="min-w-0 truncate text-lg font-bold text-primary group-data-[collapsible=icon]:hidden">
                who<span className="text-foreground">is</span>hot
                <span className="ml-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  admin
                </span>
              </span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel className="text-xs font-semibold uppercase tracking-wider">Admin Control Panel</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {NAV.map(({ to, label, icon: Icon, end }) => {
                    const isActive = end
                      ? location.pathname === to
                      : location.pathname.startsWith(to)
                    return (
                      <SidebarMenuItem key={to}>
                        <SidebarMenuButton asChild isActive={isActive} tooltip={label} className="h-11 min-h-[44px] text-sm font-medium">
                          <Link to={to}>
                            <Icon className="size-4" />
                            <span>{label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="p-3 border-t border-border/40">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Exit to Main Site" className="h-11 min-h-[44px] text-sm font-medium text-muted-foreground hover:text-foreground">
                  <Link to="/">
                    <LogOut className="size-4" />
                    <span>Exit Admin</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <header className="flex items-center justify-between gap-2 border-b border-border/60 bg-background/95 backdrop-blur-sm px-4 py-3 sticky top-0 z-10">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-10 w-10 min-h-[44px] min-w-[44px] rounded-xl" />

              <span className="text-sm font-bold md:hidden text-foreground">
                WhoIsHot Admin
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs sm:text-sm text-muted-foreground font-medium truncate max-w-48 sm:max-w-none">
                {user.display_name}
              </span>
              <Button asChild variant="outline" size="sm" className="h-9 rounded-xl gap-1.5 font-semibold text-xs border-primary/30 hover:bg-primary/10 hover:text-primary transition-colors">
                <Link to="/">
                  <LogOut className="size-3.5" />
                  <span>Exit Admin</span>
                </Link>
              </Button>
            </div>
          </header>
          <div className="flex-1 overflow-auto p-4 sm:p-6">
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
