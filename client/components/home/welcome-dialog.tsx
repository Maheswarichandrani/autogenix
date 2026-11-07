"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const REDIRECT_DELAY_MS = 4000;

export function WelcomeDialog() {
  const router = useRouter();
  const { data: session } = useSession();
  const hasRedirected = useRef(false);

  const firstName = session?.user?.name?.split(" ")[0];

  const goHome = useCallback(() => {
    if (hasRedirected.current) return;

    hasRedirected.current = true;
    // replace keeps /welcome out of history, so Back does not return here
    router.replace("/home");
  }, [router]);

  useEffect(() => {
    const timer = setTimeout(goHome, REDIRECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [goHome]);

  return (
    <Dialog open onOpenChange={goHome}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <DialogHeader className="items-center text-center sm:text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 mb-2 animate-in fade-in zoom-in-50 duration-500 motion-reduce:animate-none">
            <CheckCircle2 className="h-7 w-7 text-primary animate-in zoom-in-0 spin-in-12 delay-150 fill-mode-both duration-500 motion-reduce:animate-none" />
          </div>
          <DialogTitle className="animate-in fade-in slide-in-from-bottom-2 delay-200 fill-mode-both duration-500 motion-reduce:animate-none">
            {firstName ? `Welcome, ${firstName}` : "You're signed in"}
          </DialogTitle>
          <DialogDescription className="animate-in fade-in slide-in-from-bottom-2 delay-300 fill-mode-both duration-500 motion-reduce:animate-none">
            You have successfully logged in. Continue to explore all the features of Autogenix.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center">
          <Button className="w-full" onClick={goHome}>
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
