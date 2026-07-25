import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LogOut, Menu, Shield, Sparkles, User as UserIcon } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useAuth } from '@/context/AuthContext'
import { bracketColor } from '@/lib/brackets'

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function Header() {
  const { user, loading, logout } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  function onLogout() {
    setMobileOpen(false)
    logout()
    navigate('/')
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-border/60 px-4 sm:px-6 bg-background/95 backdrop-blur-md sticky top-0 z-40">
      <div className="flex items-center gap-3 sm:gap-6">
        <Link to="/" className="text-lg font-bold tracking-tight text-foreground hover:opacity-90 transition-opacity py-1">
          who<span className="text-primary">is</span>hot
        </Link>
        {/* Desktop Opportunities Link */}
        <Button asChild variant="ghost" size="sm" className="hidden md:flex h-9 px-3 gap-1.5 text-sm font-medium rounded-xl">
          <Link to="/opportunities">
            <Sparkles className="size-4 text-amber-500 shrink-0" />
            <span>Opportunities</span>
          </Link>
        </Button>
      </div>

      {/* Desktop User Menu / Auth Buttons */}
      <div className="hidden md:flex items-center gap-2">
        {!loading && !user && (
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="h-9 px-4 text-sm font-medium rounded-xl">
              <Link to="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm" className="h-9 px-4 text-sm font-semibold rounded-xl">
              <Link to="/register">Register</Link>
            </Button>
          </div>
        )}

        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="rounded-full ring-offset-2 ring-offset-background outline-none focus-visible:ring-2 focus-visible:ring-ring p-1 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                aria-label="Account menu"
              >
                <Avatar className="size-9">
                  <AvatarFallback
                    style={{
                      backgroundColor: bracketColor(user.gender),
                      color: 'white',
                    }}
                    className="font-bold text-xs"
                  >
                    {initials(user.display_name)}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-2xl p-2">
              <DropdownMenuLabel className="font-normal px-2 py-1.5">
                <p className="truncate font-semibold text-sm">{user.display_name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {user.email}
                </p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="my-1" />
              <DropdownMenuItem asChild className="rounded-xl cursor-pointer">
                <Link to="/me" className="flex items-center gap-2 py-2">
                  <UserIcon className="size-4" /> My account
                </Link>
              </DropdownMenuItem>
              {user.role === 'admin' && (
                <DropdownMenuItem asChild className="rounded-xl cursor-pointer">
                  <Link to="/admin" className="flex items-center gap-2 py-2">
                    <Shield className="size-4" /> Admin panel
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator className="my-1" />
              <DropdownMenuItem variant="destructive" onClick={onLogout} className="rounded-xl cursor-pointer py-2">
                <LogOut className="size-4" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Mobile Hamburger Drawer Trigger */}
      <div className="flex items-center md:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="size-10 rounded-xl min-h-[44px] min-w-[44px]" aria-label="Open mobile menu">
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-80 p-6 flex flex-col justify-between">
            <div className="space-y-6">
              <SheetHeader className="p-0 border-b pb-4">
                <SheetTitle className="text-left font-bold text-lg">
                  who<span className="text-primary">is</span>hot
                </SheetTitle>
              </SheetHeader>

              {user && (
                <div className="flex items-center gap-3 p-3 rounded-2xl bg-muted/40 border border-border/60">
                  <Avatar className="size-10">
                    <AvatarFallback
                      style={{
                        backgroundColor: bracketColor(user.gender),
                        color: 'white',
                      }}
                      className="font-bold text-sm"
                    >
                      {initials(user.display_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm truncate">{user.display_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                </div>
              )}

              <nav className="space-y-2">
                <Button
                  asChild
                  variant="ghost"
                  className="w-full justify-start h-11 text-base font-medium rounded-xl gap-2.5 px-3"
                  onClick={() => setMobileOpen(false)}
                >
                  <Link to="/opportunities">
                    <Sparkles className="size-4 text-amber-500" />
                    <span>Opportunities</span>
                  </Link>
                </Button>

                {user && (
                  <>
                    <Button
                      asChild
                      variant="ghost"
                      className="w-full justify-start h-11 text-base font-medium rounded-xl gap-2.5 px-3"
                      onClick={() => setMobileOpen(false)}
                    >
                      <Link to="/me">
                        <UserIcon className="size-4" />
                        <span>My account</span>
                      </Link>
                    </Button>

                    {user.role === 'admin' && (
                      <Button
                        asChild
                        variant="ghost"
                        className="w-full justify-start h-11 text-base font-medium rounded-xl gap-2.5 px-3 text-primary"
                        onClick={() => setMobileOpen(false)}
                      >
                        <Link to="/admin">
                          <Shield className="size-4" />
                          <span>Admin panel</span>
                        </Link>
                      </Button>
                    )}
                  </>
                )}
              </nav>
            </div>

            <div className="pt-4 border-t border-border/60">
              {user ? (
                <Button
                  variant="destructive"
                  className="w-full h-11 font-semibold rounded-xl gap-2"
                  onClick={onLogout}
                >
                  <LogOut className="size-4" />
                  <span>Log out</span>
                </Button>
              ) : (
                <div className="space-y-2">
                  <Button
                    asChild
                    variant="outline"
                    className="w-full h-11 font-semibold rounded-xl"
                    onClick={() => setMobileOpen(false)}
                  >
                    <Link to="/login">Sign in</Link>
                  </Button>
                  <Button
                    asChild
                    className="w-full h-11 font-semibold rounded-xl"
                    onClick={() => setMobileOpen(false)}
                  >
                    <Link to="/register">Register</Link>
                  </Button>
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  )
}


