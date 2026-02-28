"use client";

import { motion, type Variants } from "framer-motion";
import { Bot, Code2, Shield, Rocket } from "lucide-react";

const WorkSpaceIdealState = () => {
  // Animation variants
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.12,
        delayChildren: 0.1,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: "spring" as const,
        stiffness: 100,
        damping: 12,
      },
    },
  };

  const iconContainerVariants: Variants = {
    hidden: { scale: 0.8, opacity: 0 },
    visible: {
      scale: 1,
      opacity: 1,
      transition: {
        type: "spring" as const,
        stiffness: 200,
        damping: 15,
      },
    },
  };

  const floatVariants: Variants = {
    animate: {
      y: [-8, 8, -8],
      transition: {
        duration: 4,
        repeat: Infinity,
        ease: "easeInOut" as const,
      },
    },
  };

  const pulseVariants: Variants = {
    animate: {
      scale: [1, 1.05, 1],
      opacity: [0.5, 0.8, 0.5],
      transition: {
        duration: 3,
        repeat: Infinity,
        ease: "easeInOut" as const,
      },
    },
  };

  const orbitVariants: Variants = {
    animate: {
      rotate: 360,
      transition: {
        duration: 20,
        repeat: Infinity,
        ease: "linear" as const,
      },
    },
  };

  const features = [
    { icon: Code2, label: "Code Generation", delay: 0 },
    { icon: Shield, label: "Security Audits", delay: 0.1 },
    { icon: Rocket, label: "Deployment", delay: 0.2 },
  ];

  return (
    <div className="relative flex flex-col items-center justify-center h-full overflow-hidden">
      {/* Ambient background effects */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Primary gradient orb */}
        <motion.div
          variants={pulseVariants}
          animate="animate"
          className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-125 h-125 rounded-full"
          style={{
            background: "radial-gradient(circle, oklch(0.72 0.14 258 / 0.08) 0%, transparent 70%)",
          }}
        />
        {/* Secondary accent orb */}
        <motion.div
          variants={pulseVariants}
          animate="animate"
          style={{ animationDelay: "1.5s" }}
          className="absolute bottom-1/4 right-1/4 w-75 h-75 rounded-full"
        >
          <div
            className="w-full h-full rounded-full"
            style={{
              background: "radial-gradient(circle, oklch(0.60 0.15 295 / 0.06) 0%, transparent 70%)",
            }}
          />
        </motion.div>
      </div>

      {/* Main content */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 flex flex-col items-center max-w-lg px-6 text-center"
      >
        {/* Animated icon container */}
        <motion.div variants={iconContainerVariants} className="relative mb-8">
          {/* Outer rotating ring */}
          <motion.div
            variants={orbitVariants}
            animate="animate"
            className="absolute -inset-5 rounded-full border border-dashed border-primary/20"
          />

          {/* Orbiting dots */}
          <motion.div
            variants={orbitVariants}
            animate="animate"
            className="absolute -inset-5"
          >
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary/60" />
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary/40" />
          </motion.div>

          {/* Glow effect behind icon */}
          <div className="absolute inset-0 rounded-2xl bg-primary/20 blur-xl" />

          {/* Icon container */}
          <motion.div
            // variants={floatVariants}
            animate="animate"
            className="relative p-5 rounded-2xl bg-card border border-border/50 shadow-lg"
          >
            <div className="relative">
              <Bot className="w-10 h-10 text-primary" strokeWidth={1.5} />

            </div>
          </motion.div>
        </motion.div>

        {/* Heading */}
        <motion.h2
          variants={itemVariants}
          className="text-2xl md:text-3xl font-bold text-foreground mb-3"
        >
          No active <span className="text-primary">Orchestration</span>
        </motion.h2>

        {/* Description */}
        <motion.p
          variants={itemVariants}
          className="text-muted-foreground text-sm md:text-base leading-relaxed mb-8"
        >
          Start a new conversation with our AI agent squads to build, review,
          and deploy your projects with autonomous intelligence.
        </motion.p>

        {/* Feature pills */}
        <motion.div
          variants={itemVariants}
          className="flex flex-wrap justify-center gap-2 mb-8"
        >
          {features.map((feature) => (
            <motion.div
              key={feature.label}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5 + feature.delay, type: "spring" }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/50 border border-border/50 text-xs text-muted-foreground"
            >
              <feature.icon className="w-3 h-3 text-primary" />
              <span>{feature.label}</span>
            </motion.div>
          ))}
        </motion.div>

        {/* Action buttons */}
        <motion.div
          variants={itemVariants}
          className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto"
        >
        </motion.div>

        {/* Keyboard shortcut hint */}
        <motion.div
          variants={itemVariants}
          className="mt-6 flex items-center gap-2 text-xs text-muted-foreground/60"
        >
          <span>Press</span>
          <kbd className="px-1.5 py-0.5 rounded bg-secondary/80 border border-border font-mono text-[10px]">
            ⌘
          </kbd>
          <kbd className="px-1.5 py-0.5 rounded bg-secondary/80 border border-border font-mono text-[10px]">
            N
          </kbd>
          <span>to start quickly</span>
        </motion.div>
      </motion.div>

      {/* Bottom decorative element */}
      <motion.div
        initial={{ opacity: 0, scaleX: 0 }}
        animate={{ opacity: 1, scaleX: 1 }}
        transition={{ delay: 0.8, duration: 0.6, ease: "easeOut" }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 w-32 h-px bg-linear-to-r from-transparent via-border to-transparent"
      />
    </div>
  );
};

export default WorkSpaceIdealState;