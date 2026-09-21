"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  Home,
  Folder,
  Settings,
  PlusCircle,
  Bell,
  Search,
  Command,
  LogOut,
  AlertTriangle,
  LucideLogOut,
} from "lucide-react"
import Link from "next/link"
import { signOut } from "next-auth/react"
import Image from "next/image"

// Menu items data
const data = {
  navigation: [
    {
      name: "Dashboard",
      url: "/home",
      icon: Home,
    },
    {
      name: "Projects",
      url: "/home/projects",
      icon: Folder,
    },
  ],
  actions: [
    {
      name: "Create Project",
      url: "/home/project/new",
      icon: PlusCircle,
    },
    {
      name: "Search",
      url: "/home/search",
      icon: Search,
    },
    {
      name: "Notifications",
      url: "/home/notifications",
      icon: Bell,
    },
  ],
  settings: [
    {
      name: "Settings",
      url: "/home/settings/general",
      icon: Settings,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const [isLoggingOut, setIsLoggingOut] = React.useState(false)
  const [open, setOpen] = React.useState(false)

  const handleLogout = React.useCallback(
    async () => {
      setIsLoggingOut(true)
      try {
        await signOut({ redirectTo: "/" });
      } catch (error) {
        console.error("Logout error:", error)
      } finally {
        setIsLoggingOut(false)
        setOpen(false)
      }
    },
    []
  );

  return (
    <Sidebar collapsible="icon" {...props} >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/home" className="flex items-center gap-2">
                <div className="flex aspect-square size-8 min-w-8 min-h-8 items-center justify-center rounded-lg text-sidebar-primary-foreground">
                  <Image width={86} height={86} src="/images/logo.png" alt="Autogenix Logo" className="size-8 object-contain" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Autogenix</span>
                  <span className="truncate text-xs">Enterprise</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {data.navigation.map((item) => (
                <SidebarMenuItem key={item.name}>
                  <SidebarMenuButton
                    tooltip={item.name}
                    isActive={pathname === item.url}
                    asChild
                  >
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.name}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Quick Actions */}
        <SidebarGroup>
          <SidebarGroupLabel>Quick Actions</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {data.actions.map((item) => (
                <SidebarMenuItem key={item.name}>
                  <SidebarMenuButton
                    tooltip={item.name}
                    isActive={pathname === item.url}
                    asChild
                  >
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.name}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {data.settings.map((item) => (
            <SidebarMenuItem key={item.name}>
              <SidebarMenuButton
                tooltip={item.name}
                isActive={pathname === item.url}
                asChild
              >
                <Link href={item.url}>
                  <item.icon />
                  <span>{item.name}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}

          {/* Logout Button with Dialog */}
          <SidebarMenuItem>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <SidebarMenuButton
                  tooltip="Logout"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <LogOut />
                  <span>Logout</span>
                </SidebarMenuButton>
              </DialogTrigger>
              <DialogContent className="sm:max-w-106.25 glass-card border-glow">
                <DialogHeader>
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-linear-to-br from-destructive/20 via-destructive/10 to-transparent border border-destructive/20 glow-cyan">
                      <AlertTriangle className="h-7 w-7 text-destructive animate-pulse-cyan" />
                    </div>
                    <div className="flex-1">
                      <DialogTitle className="text-xl font-semibold bg-linear-to-r from-foreground to-muted-foreground bg-clip-text">
                        Confirm Logout
                      </DialogTitle>
                      <DialogDescription className="mt-2 text-base text-muted-foreground">
                        Are you sure you want to sign out?
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>



                <DialogFooter className="gap-3 sm:gap-3 mt-5">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOpen(false)}
                    disabled={isLoggingOut}
                    className="min-w-24 border-border/50 hover:bg-accent hover:border-primary/30 transition-all duration-200"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    className="min-w-32 gap-2 bg-destructive hover:bg-destructive/90 shadow-lg hover:shadow-destructive/25 transition-all duration-200"
                  >
                    {isLoggingOut ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        <span>Signing out...</span>
                      </>
                    ) : (
                      <>
                        <LucideLogOut className="h-4 w-4" />
                        <span>Sign Out</span>
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      {/* This rail enables the hover-to-expand and click-to-toggle functionality */}
      <SidebarRail />
    </Sidebar>
  )
}
