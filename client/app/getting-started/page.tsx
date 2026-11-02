"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Infinity, CheckCircle2, ChevronRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { usersAPI } from "@/lib/api";
import type { DeveloperLevel, PreferredStack, UpdateUserData } from "@/types/user";
import { useActionState } from "react";
import { useSession } from "next-auth/react";

// Steps configuration
const STEPS = [
  {
    id: 1,
    title: "Choose Your Stack",
    description: "What's your preferred tech stack?",
    note: "This is your default stack. If you don't mention a stack in chat, Autogenix builds with this one. If you ask for a supported stack in chat, Autogenix follows your message instead.",
    field: "preferredStack" as const,
    options: [
      { value: "fastapi", label: "FastAPI", description: "Modern Python web framework" },
      { value: "flask", label: "Flask", description: "Lightweight Python framework" },
      { value: "django", label: "Django", description: "Full-featured Python framework" },
      { value: "express", label: "Express", description: "Node.js web framework" },
      { value: "springboot", label: "Spring Boot", description: "Java application framework" },
      { value: "gin", label: "Go + Gin", description: "Fast Go web framework" },
    ],
  },
  {
    id: 2,
    title: "Developer Level",
    description: "What's your experience level?",
    field: "developerLevel" as const,
    options: [
      { value: "beginner", label: "Beginner", description: "Just getting started" },
      { value: "intermediate", label: "Intermediate", description: "Some experience" },
      { value: "advanced", label: "Advanced", description: "Years of experience" },
      { value: "founder", label: "Founder", description: "Building products" },
    ],
  },
];

type FormState = {
  preferredStack: PreferredStack | "";
  developerLevel: DeveloperLevel | "";
};

type ActionState = {
  error?: string;
  success?: boolean;
};

const GettingStartedPage = () => {
  const router = useRouter();
  const { data : session, update } = useSession();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormState>({
    preferredStack: "",
    developerLevel: "",
  });
  const [selectedOption, setSelectedOption] = useState<string>("");

  // Server action for form submission
  async function submitOnboarding(
    prevState: ActionState,
    formData: FormData
  ): Promise<ActionState> {
    try {
      const data: UpdateUserData = {
        preferred_stack: formData.get("preferredStack") as PreferredStack,
        developer_level: formData.get("developerLevel") as DeveloperLevel,
      };

      // Validate data
      if (!data.preferred_stack || !data.developer_level) {
        return { error: "Please complete all steps" };
      }

      // Call backend API to complete onboarding
      const response = await usersAPI.completeOnboarding(data);
      
      if (response.error) {
        return { error: response.error };
      }

      // Update session with new onboardingCompleted status
      // This will re-run the JWT and session callbacks in auth.ts
      await update({ onboardingCompleted: true });

      // Redirect to home
      router.push("/home");

      return { success: true };
    } catch (error) {
      console.error("Onboarding error:", error);
      return { error: error instanceof Error ? error.message : "Failed to complete onboarding" };
    }
  }

  const [state, formAction, isPending] = useActionState(submitOnboarding, {});

  const handleSelect = (field: keyof FormState, value: string) => {
    setSelectedOption(value);
    
    // Animate and move to next step
    setTimeout(() => {
      setFormData((prev) => ({ ...prev, [field]: value }));
      setSelectedOption("");
      
      if (currentStep < STEPS.length) {
        setCurrentStep((prev) => prev + 1);
      }
    }, 300);
  };

  const currentStepData = STEPS.find((step) => step.id === currentStep);
  const isLastStep = currentStep === STEPS.length;
  const canSubmit = formData.preferredStack && formData.developerLevel;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-linear-to-b from-background via-background to-card">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent blur-3xl" />
      </div>

      {/* Grid pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.02)_1px,transparent_1px)] bg-size-[64px_64px]" />

      <div className="relative z-10 w-full max-w-3xl">
        {/* Logo */}
        <Link href="/" className="flex items-center justify-center gap-2 mb-8">
          <Infinity size={32} className="text-primary" />
          <span className="font-bold text-2xl">Autogenix</span>
        </Link>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((step) => (
            <div key={step.id} className="flex items-center gap-2">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all duration-300 ${
                  step.id < currentStep
                    ? "bg-primary border-primary"
                    : step.id === currentStep
                    ? "border-primary text-primary"
                    : "border-border text-muted-foreground"
                }`}
              >
                {step.id < currentStep ? (
                  <CheckCircle2 size={16} className="text-primary-foreground" />
                ) : (
                  <span className="text-sm font-medium">{step.id}</span>
                )}
              </div>
              {step.id < STEPS.length && (
                <ChevronRight
                  size={16}
                  className={`transition-colors ${
                    step.id < currentStep ? "text-primary" : "text-muted-foreground"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Main Card */}
        <Card className="border-border shadow-2xl">
          <CardHeader className="text-center space-y-2">
            <Badge variant="outline" className="w-fit mx-auto">
              Step {currentStep} of {STEPS.length}
            </Badge>
            <CardTitle className="text-2xl font-bold">{currentStepData?.title}</CardTitle>
            <CardDescription className="text-muted-foreground">
              {currentStepData?.description}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={formAction}>
              {/* Hidden inputs for previous steps */}
              <input type="hidden" name="preferredStack" value={formData.preferredStack} />
              <input type="hidden" name="developerLevel" value={formData.developerLevel} />

              {currentStepData?.note && (
                <p className="mb-4 p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm text-muted-foreground">
                  {currentStepData.note}
                </p>
              )}

              {/* Options Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {currentStepData?.options.map((option) => {
                  const isSelected = formData[currentStepData.field] === option.value;
                  const isAnimating = selectedOption === option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleSelect(currentStepData.field, option.value)}
                      disabled={isPending}
                      className={`p-4 rounded-lg border-2 text-left transition-all duration-300 hover:border-primary hover:bg-primary/5 ${
                        isSelected
                          ? "border-primary bg-primary/10"
                          : "border-border bg-card"
                      } ${
                        isAnimating ? "scale-95 border-primary bg-primary/20" : ""
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-semibold text-foreground mb-1">
                            {option.label}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {option.description}
                          </div>
                        </div>
                        {isSelected && (
                          <CheckCircle2 size={20} className="text-primary shrink-0 ml-2" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Error Message */}
              {state.error && (
                <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  {state.error}
                </div>
              )}

              {/* Navigation Buttons */}
              <div className="flex items-center justify-between gap-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1))}
                  disabled={currentStep === 1 || isPending}
                  className="flex-1"
                >
                  Back
                </Button>

                {isLastStep && canSubmit ? (
                  <Button
                    type="submit"
                    disabled={isPending}
                    className="flex-1 custom-gradient text-white"
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Completing...
                      </>
                    ) : (
                      <>
                        Complete Setup
                        <ChevronRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (formData[currentStepData?.field || "preferredStack"]) {
                        setCurrentStep((prev) => Math.min(STEPS.length, prev + 1));
                      }
                    }}
                    disabled={!formData[currentStepData?.field || "preferredStack"] || isPending}
                    className="flex-1"
                  >
                    Continue
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};


export default GettingStartedPage;