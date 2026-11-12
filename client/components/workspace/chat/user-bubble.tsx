import type { Message } from "@/types/workflow";

export function messageText(message: Message): string {
  return message.content
    .filter((c): c is { type: "text"; content: string } => c.type === "text")
    .map((c) => c.content)
    .join("\n\n");
}

/** The user's message: a right-aligned bubble, nothing else. */
export function UserBubble({ message }: { message: Message }) {
  const text = messageText(message);
  if (!text) return null;

  return (
    <div className="flex justify-end animate-in fade-in slide-in-from-bottom-1 duration-200">
      <div className="max-w-[85%] rounded-xl bg-secondary px-4 py-2.5 sm:max-w-[80%] sm:px-5 sm:py-3">
        <p className="text-[16px] leading-relaxed whitespace-pre-wrap wrap-break-word sm:text-[17px]">{text}</p>
      </div>
    </div>
  );
}
