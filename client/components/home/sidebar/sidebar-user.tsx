"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { AlertTriangle, ChevronsUpDown, LogOut, Settings } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

function initials(name?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "U").toUpperCase() + (parts[1]?.[0] ?? "").toUpperCase();
}

/** Signed-in user with a menu for Settings and Log out. */
export function SidebarUser() {
  const { data: session } = useSession();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const name = session?.user?.name ?? "Account";

  const logout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await signOut({ redirectTo: "/" });
    } catch (error) {
      console.error("Logout error:", error);
      setLoggingOut(false);
      setConfirmOpen(false);
    }
  }, []);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" tooltip={name} className="data-[state=open]:bg-sidebar-accent">
              <Avatar className="size-8 rounded-full">
                {session?.user?.image && <AvatarImage src={session.user.image} alt="" />}
                <AvatarFallback className="rounded-full bg-primary/15 text-xs font-semibold text-primary">
                  {initials(session?.user?.name)}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate text-left text-[15px] font-medium">{name}</span>
              <ChevronsUpDown className="size-4 text-sidebar-foreground/60" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
            {session?.user?.email && (
              <>
                <div className="truncate px-2 py-1.5 text-xs text-muted-foreground">{session.user.email}</div>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem asChild>
              <Link href="/home/settings/general">
                <Settings className="size-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => setConfirmOpen(true)}
              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            >
              <LogOut className="size-4 text-destructive" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Dialog open={confirmOpen} onOpenChange={(v) => !loggingOut && setConfirmOpen(v)}>
          <DialogContent className="sm:max-w-106.25">
            <DialogHeader>
              <div className="flex items-center gap-4">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-destructive/20 bg-destructive/10">
                  <AlertTriangle className="size-6 text-destructive" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-semibold">Log out?</DialogTitle>
                  <DialogDescription className="mt-1">You&apos;ll need to sign in with GitHub again.</DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <DialogFooter className="mt-4 gap-3 sm:gap-3">
              <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={loggingOut}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={logout} disabled={loggingOut} className="min-w-28 gap-2">
                {loggingOut ? (
                  <>
                    <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Signing out…
                  </>
                ) : (
                  <>
                    <LogOut className="size-4" />
                    Log out
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
