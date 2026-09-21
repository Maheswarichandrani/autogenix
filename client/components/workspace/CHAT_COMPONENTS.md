# Workspace Chat Components

Complete modular chat system for Autogenix workflow interface.

## 🏗️ Architecture

```
WorkspaceChat (Main Container)
├── ChatMessageItem (Message Router)
│   ├── UserMessage (User's prompts - bg-primary)
│   ├── AssistantMessage (AI responses)
│   │   ├── MarkdownContent (Formatted text)
│   │   └── ArtifactCard (Plans/Code artifacts)
│   └── SystemMessage (Rare system notifications)
└── StreamingMessage (Live SSE streaming)
```

## 📦 Components

### 1. `WorkspaceChat`
**Main container** - Connects to useWorkflow hook and orchestrates entire chat UI.

**Props:**
- `projectId: string` - Active project ID

**Features:**
- Auto-scrolls to latest message
- Shows loading/error states
- Handles message submission
- Renders persisted messages + live streaming
- Empty state for new projects

---

### 2. `ChatMessageItem`
**Message router** - Determines which component to render based on message role.

**Props:**
- `message: Message` - Message object from workflow types

**Routing:**
- `role: "user"` → `<UserMessage />`
- `role: "assistant"` → `<AssistantMessage />`
- `role: "system"` → Small centered badge

---

### 3. `UserMessage`
**User messages** - Displays user prompts with primary background.

**Props:**
- `message: Message`

**Styling:**
- `bg-primary` with `text-primary-foreground`
- Rounded corners with sharp top-left (`rounded-tl-sm`)
- Max width 85% for chat bubble effect
- Avatar with User icon

---

### 4. `AssistantMessage`
**AI responses** - Renders AI messages with markdown support and artifacts.

**Props:**
- `message: Message`

**Features:**
- Loops through `message.content` array
- Renders text blocks with `MarkdownContent`
- Renders artifacts with `ArtifactCard`
- Bot avatar with primary accent
- Muted background for contrast

**Content Types:**
```typescript
content: [
  { type: "text", content: "Some markdown text..." },
  { 
    type: "artifact", 
    artifact_id: "xyz",
    artifact_data: {
      artifact_type: "plan",
      title: "Project Plan",
      content: { ...Plan object }
    }
  }
]
```

---

### 5. `MarkdownContent`
**Markdown renderer** - Formats AI text responses with syntax highlighting.

**Props:**
- `content: string` - Raw markdown text

**Dependencies:**
- `react-markdown` - Markdown parser
- `react-syntax-highlighter` - Code block highlighting
- `oneDark` theme for code

**Custom Styling:**
- Code blocks: Dark theme with `oneDark` style
- Inline code: `bg-muted` badge style
- Links: Open in new tab with `text-primary`
- Lists: Compact spacing
- Headings: Smaller sizes for chat context

---

### 6. `ArtifactCard`
**Artifact renderer** - Displays structured data (plans, code, schemas).

**Props:**
- `artifactType: string` - Type of artifact
- `title: string` - Display title
- `content: unknown` - Artifact data

**Special Handling:**

#### Plan Artifacts
When `artifactType === "plan"`, renders rich UI:
- **Overview** - Plain text description
- **Tech Stack** - Collapsible badges (language, framework, database)
- **Architecture** - Text description
- **Database Schemas** - Table cards with field types
- **API Endpoints** - Method badges + path + description

#### Generic Artifacts
For unknown types, shows JSON preview:
```tsx
<Card>
  <Badge>{artifactType}</Badge>
  <pre>{JSON.stringify(content)}</pre>
</Card>
```

---

### 7. `StreamingMessage`
**Live streaming display** - Shows AI response as it's being generated.

**Props:**
- `content: string` - Current streamed text (from Zustand `streaming_text`)
- `activeRole: string | null` - Which agent is active (Conductor, Artificer, etc.)

**Features:**
- Animated fade-in on mount
- Pulsing loader icon
- "Thinking..." state when no content yet
- Blinking cursor after streamed text
- Shows active role in label: "Autogenix (Conductor)"

**Usage:**
```tsx
{is_streaming && (
  <StreamingMessage 
    content={streaming_text}
    activeRole={active_role}
  />
)}
```

---

## 🔄 Data Flow

### Persisted Messages (TanStack Query)
```typescript
const { messages } = useWorkflow(projectId);

messages.map(msg => <ChatMessageItem message={msg} />)
```

### Live Streaming (Zustand Store)
```typescript
const { is_streaming, streaming_text, active_role } = useWorkflow(projectId);

{is_streaming && (
  <StreamingMessage content={streaming_text} activeRole={active_role} />
)}
```

### SSE Event → Zustand → UI
1. Backend sends SSE event: `{ type: "text_chunk", chunk: "Hello", role: "conductor" }`
2. useWorkflow receives event → calls `handleSSEEvent()`
3. Zustand store updates `streaming_text`, `active_role`, `is_streaming`
4. React re-renders `<StreamingMessage />` with new text
5. On `{ type: "done" }`, TanStack Query refetches persisted messages

---

## 🎨 Styling Patterns

### User Messages
- **Background:** `bg-primary` (your theme's primary color)
- **Text:** `text-primary-foreground` (auto contrast)
- **Border:** `rounded-2xl rounded-tl-sm` (sharp corner for speech bubble)
- **Max Width:** `max-w-[85%]` (doesn't span full width)

### Assistant Messages
- **Background:** `bg-muted/50` (subtle, non-intrusive)
- **Text:** Default foreground
- **Border:** `rounded-2xl rounded-tl-sm`
- **Max Width:** `max-w-[95%]` (slightly wider than user)

### Artifacts
- **Border:** `border-primary/20` (subtle accent)
- **Background:** `bg-card/50`
- **Badges:** `variant="outline"` with `bg-primary/10`

### Streaming
- **Animation:** `animate-in fade-in duration-300`
- **Cursor:** Pulsing vertical bar `animate-pulse`
- **Loader:** Spinning `Loader2` icon

---

## 🧪 Example Usage

```tsx
import WorkspaceChat from "@/components/workspace/workspace-chat";

export default function WorkspacePage({ params }: { params: { id: string } }) {
  return (
    <div className="h-screen">
      <WorkspaceChat projectId={params.id} />
    </div>
  );
}
```

---

## 📋 Message Types Reference

### User Message
```typescript
{
  id: "123",
  role: "user",
  message_type: "user_prompt",
  content: [
    { type: "text", content: "Build a todo app" }
  ],
  created_at: "2024-01-01T00:00:00Z"
}
```

### Assistant Text Message
```typescript
{
  id: "124",
  role: "assistant",
  message_type: "agent_response",
  content: [
    { 
      type: "text", 
      content: "I'll create a **React** todo app with:\n- User auth\n- CRUD operations" 
    }
  ],
  created_at: "2024-01-01T00:00:01Z"
}
```

### Assistant with Plan Artifact
```typescript
{
  id: "125",
  role: "assistant",
  message_type: "plan_artifact",
  content: [
    { type: "text", content: "Here's the plan:" },
    {
      type: "artifact",
      artifact_id: "plan-xyz",
      artifact_data: {
        artifact_type: "plan",
        title: "Todo App Plan",
        content: {
          overview: "A full-stack todo application...",
          tech_stack: {
            language: "TypeScript",
            framework: "Next.js",
            database: "PostgreSQL"
          },
          // ... more plan data
        }
      }
    }
  ],
  created_at: "2024-01-01T00:00:05Z"
}
```

---

## 🔧 Dependencies

```json
{
  "react-markdown": "^9.x",
  "react-syntax-highlighter": "^15.x",
  "@types/react-syntax-highlighter": "^15.x"
}
```

Install:
```bash
npm install react-markdown react-syntax-highlighter
npm install -D @types/react-syntax-highlighter
```

---

## ✅ Features Checklist

- ✅ User messages with `bg-primary`
- ✅ AI responses with markdown formatting
- ✅ Code syntax highlighting (via Prism.js)
- ✅ Plan artifacts with collapsible sections
- ✅ Database schema visualization
- ✅ API endpoint cards with method badges
- ✅ Live streaming with typing cursor
- ✅ Active agent role display
- ✅ Auto-scroll to latest message
- ✅ Loading/error states
- ✅ Empty state for new projects
- ✅ Optimistic UI updates (user messages appear instantly)
- ✅ SSE event handling via useWorkflow hook

---

## 🚀 Next Steps

1. **Add user avatars**: Replace generic User icon with session user's GitHub avatar
2. **Message actions**: Add copy, regenerate, edit buttons
3. **Artifact actions**: Add approve/reject buttons for plans
4. **Code artifacts**: Create specialized renderer for code files
5. **Tool call visualization**: Show when agents are using tools
6. **Stage indicators**: Visual badges for workflow stages
7. **Inline file previews**: Clickable file paths that open in editor

---

## 📝 Notes

- All components are **client components** (`"use client"`)
- Markdown rendering is **server-safe** via react-markdown
- Artifacts are **type-safe** via TypeScript discrimination
- Streaming is **real-time** via SSE + Zustand
- History is **cached** via TanStack Query (30s staleTime)
- Messages are **optimistic** - user messages show instantly, then get real IDs from backend
