import NextAuth from "next-auth";
import type { JWT } from "next-auth/jwt";
import type { Session, User } from "next-auth";
import GitHub from "next-auth/providers/github"

export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [
        GitHub({
            clientId: process.env.GITHUB_CLIENT_ID!,
            clientSecret: process.env.GITHUB_CLIENT_SECRET!,
            // GitHub sends this as the `iss` callback param; Auth.js rejects it unless it matches
            issuer: "https://github.com/login/oauth",
            authorization: {
                params: {
                    scope: "read:user user:email repo",
                },
            },
        }),
    ],
    callbacks: {
        /**
         * JWT callback - runs when token is created or updated
         */
        async jwt({ token, user, account, trigger, session }): Promise<JWT> {
            if (account && user) {
                token.id = user.id;
                token.email = user.email;
                token.username = user.username;
                token.onboardingCompleted = user.onboardingCompleted;
            }

            // Handle session updates (like onboarding completion)
            if (trigger === "update" && session?.onboardingCompleted !== undefined) {
                token.onboardingCompleted = session.onboardingCompleted;
            }

            return token;
        },

        /**
         * Session callback - runs when session is checked
         * The session object should NOT contain the GitHub access token
         * We'll get the NextAuth JWT token separately in the API client
         */
        async session({ session, token }): Promise<Session> {
            if (session.user) {
                session.user.id = token.id as string;
                session.user.email = token.email as string;
                session.user.username = token.username as string | undefined;
                session.user.onboardingCompleted = token.onboardingCompleted as boolean;
                
                // DO NOT include GitHub access token in session
                // The NextAuth JWT token itself will be used for backend auth
            }

            return session;
        },

        /**
         * SignIn callback - called server-side, must use plain fetch (not axios/getSession)
         * This still uses GitHub token for initial user creation/verification
         */
        async signIn({ user, account }) {
            if (account?.provider === "github") {
                try {
                    if (!account.access_token) {
                        throw new Error("GitHub access token is missing");
                    }

                    // IMPORTANT: Use plain fetch here.
                    // This callback runs server-side — axios interceptors that call
                    // getSession() (a client-only API) will throw an error.
                    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
                    const res = await fetch(`${apiUrl}/api/v1/users/signin`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ github_token: account.access_token }),
                    });

                    if (!res.ok) {
                        throw new Error(`Backend signin failed with status: ${res.status}`);
                    }

                    const dbUser = await res.json();

                    // Attach backend user data to the user object for JWT
                    user.id = dbUser.id; // Databae user ID
                    user.email = dbUser.email;
                    user.username = dbUser.username;
                    user.onboardingCompleted = dbUser.onboarding_completed === 1;
                    // Add GitHub ID as a custom property

                    return true;
                } catch (error) {
                    console.error("Error during sign in:", error);
                    return false;
                }
            }
            return true;
        },
    },
    pages: {
        signIn: "/login",
    },
    session: {
        strategy: "jwt",
    },
    // Ensure JWT secret matches what we use in the backend
    secret: process.env.AUTH_SECRET,
});