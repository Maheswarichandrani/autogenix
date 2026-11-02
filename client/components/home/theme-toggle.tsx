"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

export function ThemeToggle() {
    const { theme, setTheme } = useTheme();

    // Avoid hydration mismatch: false on the server and during hydration, then true
    const mounted = useSyncExternalStore(
        () => () => {},
        () => true,
        () => false,
    );

    if (!mounted) {
        return (
            <div className="space-y-2">
                <Label htmlFor="colorMode" className="text-sm text-muted-foreground">
                    Color mode
                </Label>
                <Select disabled>
                    <SelectTrigger id="colorMode" className="w-full max-w-xs">
                        <SelectValue placeholder="Loading..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="light">Light</SelectItem>
                        <SelectItem value="dark">Dark</SelectItem>
                        <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <Label htmlFor="colorMode" className="text-sm text-muted-foreground">
                Color mode
            </Label>
            <Select value={theme} onValueChange={setTheme}>
                <SelectTrigger id="colorMode" className="w-full max-w-xs">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                </SelectContent>
            </Select>
        </div>
    );
}
