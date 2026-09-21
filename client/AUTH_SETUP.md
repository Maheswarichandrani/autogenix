# Autogenix - Authentication Setup Guide

This guide will help you set up GitHub OAuth authentication for your Autogenix application.

## Prerequisites

- GitHub account
- Backend API running on `http://localhost:8000`
- Node.js and npm/yarn/pnpm installed

## Setup Steps

### 1. Install Dependencies

If not already installed, run:

```bash
npm install next-auth@beta
```

### 2. Create GitHub OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Fill in the application details:
   - **Application name**: Autogenix Local Development
   - **Homepage URL**: `http://localhost:3000`
   - **Authorization callback URL**: `http://localhost:3000/api/auth/callback/github`
4. Click "Register application"
5. Copy the **Client ID**
6. Click "Generate a new client secret" and copy the **Client Secret**

### 3. Update Environment Variables

Your `.env.local` file should already have these variables, but make sure the GitHub credentials are filled in:

```env
# Authentication Secret (Keep this secret!)
AUTH_SECRET=JMT1tTJLjjZa0lC0iPuVBuxLud3y+oGNsLSOCDNzW0E=

# GitHub OAuth
GITHUB_CLIENT_ID=your_github_client_id_here
GITHUB_CLIENT_SECRET=your_github_client_secret_here

# Base URL for your application
AUTH_URL=http://localhost:3000

# Backend API URL
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Replace `your_github_client_id_here` and `your_github_client_secret_here` with the values from step 2.

### 4. Backend Setup

Your backend needs to have an endpoint to handle GitHub OAuth callbacks:

**Endpoint**: `POST /api/auth/github`

**Request Body**:
```json
{
  "githubId": "12345678",
  "email": "user@example.com",
  "username": "username",
  "accessToken": "gho_..."
}
```

**Response**:
```json
{
  "id": "uuid-string",
  "github_id": "12345678",
  "email": "user@example.com",
  "username": "username",
  "preferred_stack": null,
  "preferred_language": null,
  "developer_level": "beginner",
  "onboarding_completed": 0,
  "subscription_tier": "free",
  "monthly_builds_used": 0,
  "monthly_builds_limit": 10,
  "created_at": "2024-01-01T00:00:00Z",
  "last_active_at": "2024-01-01T00:00:00Z"
}
```

### 5. Run the Application

```bash
npm run dev
```

Visit `http://localhost:3000` and click "Get Started" or "Log in" to test authentication.

## File Structure

```
├── app/
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx          # Login page with GitHub button
│   ├── api/
│   │   └── auth/
│   │       └── [...nextauth]/
│   │           └── route.ts      # NextAuth API route
│   ├── home/
│   │   └── page.tsx              # Protected home page
│   └── layout.tsx                # Root layout with SessionProvider
├── components/
│   └── providers/
│       └── session-provider.tsx  # Session provider wrapper
├── hooks/
│   └── use-session.ts            # Custom hook for accessing session
├── lib/
│   ├── auth.ts                   # NextAuth configuration
│   ├── api-client.ts             # API client for backend requests
│   └── utils.ts                  # Utility functions
├── types/
│   └── user.ts                   # User type definitions
├── middleware.ts                 # Route protection middleware
├── next-auth.d.ts                # NextAuth type extensions
└── .env.local                    # Environment variables
```

## Key Features

### Type-Safe Authentication

All authentication types are fully typed and extend NextAuth's default types:

```typescript
// Access session in client components
import { useSession } from "@/hooks/use-session";

function MyComponent() {
  const { user, accessToken, isAuthenticated } = useSession();
  
  if (user) {
    console.log(user.githubId);        // Fully typed
    console.log(user.subscriptionTier); // "free" | "pro" | "enterprise"
  }
}
```

### Server-Side Access

```typescript
import { auth } from "@/lib/auth";

export default async function Page() {
  const session = await auth();
  
  if (!session) {
    redirect("/login");
  }
  
  return <div>Welcome {session.user.username}</div>;
}
```

### API Client

Make authenticated requests to your backend:

```typescript
import { apiClient } from "@/lib/api-client";
import type { User } from "@/types/user";

// GET request
const user = await apiClient.get<User>("/api/user/me");

// POST request
const project = await apiClient.post("/api/projects", {
  name: "My Project",
  stack: "nextjs"
});

// Automatically includes Bearer token in Authorization header
```

### Route Protection

The middleware automatically protects routes:

- `/home` - Requires authentication
- `/project/*` - Requires authentication
- `/login` - Redirects to `/home` if already authenticated
- `/` - Public landing page

## Callbacks

### JWT Callback

Runs when the token is created or updated. We attach the user data and access token to the JWT:

```typescript
async jwt({ token, user, account }): Promise<JWT> {
  if (account && user) {
    token.accessToken = account.access_token;
    token.id = user.id;
    // ... all other user fields
  }
  return token;
}
```

### Session Callback

Runs when the session is checked. We attach the JWT data to the session:

```typescript
async session({ session, token }): Promise<Session> {
  if (token.accessToken) {
    session.accessToken = token.accessToken as string;
  }
  
  if (session.user) {
    session.user.id = token.id as string;
    // ... all other user fields
  }
  
  return session;
}
```

### SignIn Callback

Runs when the user signs in. We call the backend API to create/update the user:

```typescript
async signIn({ user, account, profile }) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/github`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      githubId: profile?.id,
      email: user.email,
      username: profile?.login,
      accessToken: account.access_token,
    }),
  });
  
  const backendUser = await response.json();
  
  // Attach backend user data to the user object
  user.id = backendUser.id;
  user.githubId = backendUser.github_id;
  // ... all other fields
  
  return true;
}
```

## Troubleshooting

### "Invalid callback URL" error

Make sure the callback URL in your GitHub OAuth app matches exactly:
```
http://localhost:3000/api/auth/callback/github
```

### Session not persisting

1. Check that `AUTH_SECRET` is set in `.env.local`
2. Make sure cookies are enabled in your browser
3. Clear browser cache and cookies for localhost

### Backend connection error

1. Make sure your backend is running on `http://localhost:8000`
2. Check that `NEXT_PUBLIC_API_URL` is set correctly in `.env.local`
3. Verify the backend endpoint `/api/auth/github` exists and is working

### Type errors

1. Make sure `next-auth.d.ts` is in the root directory
2. Restart the TypeScript server in VS Code
3. Run `npm run build` to check for type errors

## Production Deployment

When deploying to production:

1. Create a new GitHub OAuth app with your production URLs
2. Update environment variables in your hosting platform
3. Make sure `AUTH_URL` matches your production domain
4. Update `NEXT_PUBLIC_API_URL` to your production backend URL
5. Keep `AUTH_SECRET` secure and never commit it to version control

## Next Steps

- [ ] Implement onboarding flow for new users
- [ ] Add profile management page
- [ ] Implement subscription upgrade flow
- [ ] Add project creation and management
- [ ] Set up database migrations for user data
