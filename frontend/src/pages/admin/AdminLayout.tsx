import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import {
  AtSign,
  BarChart3,
  DollarSign,
  Flag,
  ScrollText,
  Trophy,
  Users as UsersIcon,
  Wallet,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
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
import { TooltipProvider } from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/context/AuthContext'

const NAV = [
  { to: '/admin', label: 'Overview', icon: BarChart3, end: true },
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
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
                W
              </span>
              <span className="min-w-0 truncate text-lg font-bold text-primary group-data-[collapsible=icon]:hidden">
                who<span className="text-foreground">is</span>hot
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  admin
                </span>
              </span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Admin</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {NAV.map(({ to, label, icon: Icon, end }) => {
                    const isActive = end
                      ? location.pathname === to
                      : location.pathname.startsWith(to)
                    return (
                      <SidebarMenuItem key={to}>
                        <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
                          <Link to={to}>
                            <Icon />
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
        </Sidebar>
        <SidebarInset>
          <header className="flex items-center gap-2 border-b px-4 py-3">
            <SidebarTrigger />
            <span className="text-sm text-muted-foreground">
              Signed in as {user.display_name}
            </span>
          </header>
          <div className="flex-1 overflow-auto p-4 sm:p-6">
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
