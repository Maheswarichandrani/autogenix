import { WelcomeDialog } from "@/components/home/welcome-dialog";

export default function WelcomePage() {
  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-linear-to-b from-background via-background to-card">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent blur-3xl" />
      </div>

      {/* Grid pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.02)_1px,transparent_1px)] bg-[size:64px_64px]" />

      <WelcomeDialog />
    </div>
  );
}
