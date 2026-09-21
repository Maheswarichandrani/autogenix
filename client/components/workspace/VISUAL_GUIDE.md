# 🎨 Workspace Chat - Visual Component Guide

## Component Tree
```
┌─────────────────────────────────────────────────────────────┐
│  WorkspaceChat (Container)                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Messages Area (Scrollable)                          │   │
│  │  ┌─────────────────────────────────────────────────┐ │   │
│  │  │  ChatMessageItem                                 │ │   │
│  │  │  ┌────────────────────────────────────────────┐  │ │   │
│  │  │  │ 👤 You                                     │  │ │   │
│  │  │  │ ┌────────────────────────────────────────┐│  │ │   │
│  │  │  │ │ Build a todo app                       ││  │ │   │
│  │  │  │ └────────────────────────────────────────┘│  │ │   │
│  │  │  │   UserMessage (bg-primary)                │  │ │   │
│  │  │  └────────────────────────────────────────────┘  │ │   │
│  │  └─────────────────────────────────────────────────┘ │   │
│  │  ┌─────────────────────────────────────────────────┐ │   │
│  │  │  ChatMessageItem                                 │ │   │
│  │  │  ┌────────────────────────────────────────────┐  │ │   │
│  │  │  │ 🤖 Autogenix                                 │  │ │   │
│  │  │  │ ┌────────────────────────────────────────┐│  │ │   │
│  │  │  │ │ I'll create a **React** todo app...   ││  │ │   │
│  │  │  │ │ - User authentication                  ││  │ │   │
│  │  │  │ │ - CRUD operations                      ││  │ │   │
│  │  │  │ └────────────────────────────────────────┘│  │ │   │
│  │  │  │   AssistantMessage → MarkdownContent      │  │ │   │
│  │  │  │                                             │  │ │   │
│  │  │  │ ┌────────────────────────────────────────┐│  │ │   │
│  │  │  │ │ 📋 Project Plan                        ││  │ │   │
│  │  │  │ │ ┌──────────────────────────────────────┤│  │ │   │
│  │  │  │ │ │ Overview: A full-stack todo app...  │││  │ │   │
│  │  │  │ │ │                                      │││  │ │   │
│  │  │  │ │ │ 💻 Tech Stack                        │││  │ │   │
│  │  │  │ │ │   Language: TypeScript              │││  │ │   │
│  │  │  │ │ │   Framework: Next.js                │││  │ │   │
│  │  │  │ │ │   Database: PostgreSQL              │││  │ │   │
│  │  │  │ │ │                                      │││  │ │   │
│  │  │  │ │ │ 🗄️ Database Schemas                  │││  │ │   │
│  │  │  │ │ │   todos                              │││  │ │   │
│  │  │  │ │ │     id: UUID                         │││  │ │   │
│  │  │  │ │ │     title: VARCHAR                   │││  │ │   │
│  │  │  │ │ └──────────────────────────────────────┘││  │ │   │
│  │  │  │ └────────────────────────────────────────┘│  │ │   │
│  │  │  │   AssistantMessage → ArtifactCard         │  │ │   │
│  │  │  └────────────────────────────────────────────┘  │ │   │
│  │  └─────────────────────────────────────────────────┘ │   │
│  │  ┌─────────────────────────────────────────────────┐ │   │
│  │  │  StreamingMessage (Live)                         │ │   │
│  │  │  ┌────────────────────────────────────────────┐  │ │   │
│  │  │  │ 🤖 Autogenix (Conductor) ⏳                  │  │ │   │
│  │  │  │ ┌────────────────────────────────────────┐│  │ │   │
│  │  │  │ │ I'm analyzing your requirements...█    ││  │ │   │
│  │  │  │ └────────────────────────────────────────┘│  │ │   │
│  │  │  │   (Pulsing cursor)                         │  │ │   │
│  │  │  └────────────────────────────────────────────┘  │ │   │
│  │  └─────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  WorkspacePromptInput                                │   │
│  │  ┌─────────────────────────────────────────────────┐ │   │
│  │  │ Ask Autogenix to build, modify, or explain...     │ │   │
│  │  └─────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Color Scheme

### User Messages
```
┌──────────────────────────────────┐
│  bg-primary                      │  ← Your theme's primary color
│  text-primary-foreground         │  ← Auto contrast text
│  "Build a todo app"              │
└──────────────────────────────────┘
   ↖ Sharp corner (rounded-tl-sm)
```

### Assistant Messages
```
┌──────────────────────────────────┐
│  bg-muted/50                     │  ← Subtle background
│  default text color              │
│  "I'll create a **React** app"  │  ← Markdown formatted
└──────────────────────────────────┘
   ↖ Sharp corner (rounded-tl-sm)
```

### Artifacts
```
┌──────────────────────────────────┐
│  border-primary/20               │  ← Subtle accent border
│  bg-card/50                      │  ← Semi-transparent card
│                                  │
│  📋 Project Plan        [Plan]   │  ← Title + Badge
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                  │
│  Overview: ...                   │
│  Tech Stack: ▼                   │  ← Collapsible
│    Language: TypeScript          │
│    Framework: Next.js            │
│                                  │
└──────────────────────────────────┘
```

### Streaming Message
```
┌──────────────────────────────────┐
│  🤖 Autogenix (Conductor) ⏳       │  ← Agent name + spinner
│  ┌────────────────────────────┐ │
│  │ Analyzing requirements...█ │ │  ← Pulsing cursor
│  └────────────────────────────┘ │
│     (fade-in animation)          │
└──────────────────────────────────┘
```

## States

### Loading
```
    ⏳ Loading...
```

### Error
```
┌──────────────────────────────────┐
│  ⚠️ Error                         │
│  Failed to send message           │
└──────────────────────────────────┘
```

### Empty
```
        ┌───────────┐
        │     ⏳    │
        └───────────┘
    
  Start Building with Autogenix
  
  Describe what you want to build,
  request a plan, or ask for
  modifications to your project.
```

### Processing (Input disabled)
```
┌──────────────────────────────────┐
│ Ask Autogenix...        [⏳]       │  ← Disabled state
└──────────────────────────────────┘
```

## Markdown Rendering Examples

### Code Blocks
````markdown
```typescript
function hello() {
  console.log("Hello!");
}
```
````

Renders as:
```
┌──────────────────────────────────┐
│  typescript                      │  ← Language badge
│  ┌────────────────────────────┐ │
│  │ function hello() {          │ │  ← Syntax highlighted
│  │   console.log("Hello!");    │ │     (oneDark theme)
│  │ }                           │ │
│  └────────────────────────────┘ │
└──────────────────────────────────┘
```

### Inline Code
```
Use the `useState` hook
```

Renders as:
```
Use the ┌─────────┐ hook
        │useState │  ← bg-muted badge
        └─────────┘
```

### Lists
```markdown
- Item 1
- Item 2
```

Renders as:
```
• Item 1
• Item 2
```

### Links
```markdown
Check [the docs](https://example.com)
```

Renders as:
```
Check the docs  ← Opens in new tab
      ━━━━━━━━
      (underline on hover)
```

## File Structure
```
components/workspace/
├── workspace-chat.tsx          ← Main container
├── chat-message-item.tsx       ← Message router
├── user-message.tsx            ← User messages (bg-primary)
├── assistant-message.tsx       ← AI responses
├── markdown-content.tsx        ← Markdown formatter
├── artifact-card.tsx           ← Plan/code artifacts
├── streaming-message.tsx       ← Live SSE streaming
├── index.ts                    ← Exports
├── CHAT_COMPONENTS.md          ← Full documentation
└── VISUAL_GUIDE.md             ← This file
```

## Usage Example

```tsx
// app/workspace/[id]/page.tsx
import WorkspaceChat from "@/components/workspace/workspace-chat";

export default function WorkspacePage({ 
  params 
}: { 
  params: { id: string } 
}) {
  return (
    <div className="h-screen flex flex-col">
      <Header />
      <WorkspaceChat projectId={params.id} />
    </div>
  );
}
```

## Data Flow

```
Backend SSE Stream
        ↓
  useWorkflow Hook
   ↓           ↓
Zustand     TanStack Query
(live)      (persisted)
   ↓           ↓
streaming   messages[]
_text
   ↓           ↓
   ↓      ChatMessageItem
   ↓           ↓
   ↓      UserMessage
   ↓      AssistantMessage
   ↓           ↓
   ↓      MarkdownContent
   ↓      ArtifactCard
   ↓
StreamingMessage
```

## Key Features

✅ **User messages** - bg-primary, sharp corner, max-width 85%  
✅ **AI responses** - Markdown formatted with syntax highlighting  
✅ **Artifacts** - Rich UI for plans (collapsible, badges, schemas)  
✅ **Live streaming** - Typing cursor, active agent role  
✅ **Auto-scroll** - Smooth scroll to latest message  
✅ **Optimistic UI** - User messages appear instantly  
✅ **Error handling** - Alert banner for errors  
✅ **Empty state** - Helpful prompt for new projects  
✅ **Loading state** - Spinner while fetching history  

## Responsive Design

- Desktop: Max width 3xl, centered
- Mobile: Full width with padding
- Avatar size: 8x8 (2rem)
- Font sizes: sm (14px) for body, xs (12px) for labels
- Spacing: Consistent 3-4 gaps between elements
