"use client";

import { motion } from "framer-motion";
import {
  Settings,
  User,
  Bell,
  Shield,
  Palette,
  Key,
  Globe,
  Monitor,
  Moon,
  Sun,
  Laptop,
  Volume2,
  VolumeX,
  Save,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

export function SettingsSidebar() {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="h-full overflow-y-auto p-6 space-y-6"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 border border-primary/20">
          <Settings className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Settings</h2>
          <p className="text-xs text-muted-foreground">Configure your workspace</p>
        </div>
      </div>

      <Separator />

      {/* Profile Settings */}
      <Card className="border-border/50 bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <User className="h-4 w-4" />
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username" className="text-xs text-muted-foreground">
              Username
            </Label>
            <Input
              id="username"
              placeholder="Enter username"
              className="h-8 text-sm"
              defaultValue="user@nexusai.dev"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="display-name" className="text-xs text-muted-foreground">
              Display Name
            </Label>
            <Input
              id="display-name"
              placeholder="Display name"
              className="h-8 text-sm"
              defaultValue="Nexus Developer"
            />
          </div>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card className="border-border/50 bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Appearance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Theme</Label>
            <Select defaultValue="system">
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light" className="text-sm">
                  <div className="flex items-center gap-2">
                    <Sun className="h-3.5 w-3.5" />
                    Light
                  </div>
                </SelectItem>
                <SelectItem value="dark" className="text-sm">
                  <div className="flex items-center gap-2">
                    <Moon className="h-3.5 w-3.5" />
                    Dark
                  </div>
                </SelectItem>
                <SelectItem value="system" className="text-sm">
                  <div className="flex items-center gap-2">
                    <Laptop className="h-3.5 w-3.5" />
                    System
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="compact-mode" className="text-xs text-muted-foreground">
              Compact mode
            </Label>
            <Switch id="compact-mode" />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="animations" className="text-xs text-muted-foreground">
              Animations
            </Label>
            <Switch id="animations" defaultChecked />
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card className="border-border/50 bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="build-notifications" className="text-xs text-muted-foreground">
                Build notifications
              </Label>
              <p className="text-xs text-muted-foreground/70">Get notified when builds complete</p>
            </div>
            <Switch id="build-notifications" defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="sound" className="text-xs text-muted-foreground">
                Sound
              </Label>
              <p className="text-xs text-muted-foreground/70">Play sounds for notifications</p>
            </div>
            <Switch id="sound" />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="desktop-notifications" className="text-xs text-muted-foreground">
                Desktop notifications
              </Label>
              <p className="text-xs text-muted-foreground/70">Show notifications in your OS</p>
            </div>
            <Switch id="desktop-notifications" defaultChecked />
          </div>
        </CardContent>
      </Card>

      {/* Security */}
      <Card className="border-border/50 bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Security
            <Badge variant="secondary" className="text-xs">
              Pro
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="two-factor" className="text-xs text-muted-foreground">
                Two-factor authentication
              </Label>
              <p className="text-xs text-muted-foreground/70">Add an extra layer of security</p>
            </div>
            <Switch id="two-factor" />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="session-timeout" className="text-xs text-muted-foreground">
                Auto-logout
              </Label>
              <p className="text-xs text-muted-foreground/70">Automatically logout after inactivity</p>
            </div>
            <Switch id="session-timeout" defaultChecked />
          </div>
          <Button variant="outline" size="sm" className="w-full text-xs">
            <Key className="h-3.5 w-3.5 mr-2" />
            Manage API Keys
          </Button>
        </CardContent>
      </Card>

      {/* Developer */}
      <Card className="border-border/50 bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Monitor className="h-4 w-4" />
            Developer
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="debug-mode" className="text-xs text-muted-foreground">
              Debug mode
            </Label>
            <Switch id="debug-mode" />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="auto-save" className="text-xs text-muted-foreground">
              Auto-save
            </Label>
            <Switch id="auto-save" defaultChecked />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Auto-save interval</Label>
            <Select defaultValue="30">
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 seconds</SelectItem>
                <SelectItem value="30">30 seconds</SelectItem>
                <SelectItem value="60">1 minute</SelectItem>
                <SelectItem value="300">5 minutes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-2 pt-4">
        <Button size="sm" className="flex-1 text-xs">
          <Save className="h-3.5 w-3.5 mr-2" />
          Save Changes
        </Button>
        <Button variant="outline" size="sm" className="text-xs">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>
    </motion.div>
  );
}
