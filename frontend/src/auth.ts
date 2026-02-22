import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { SignJWT } from "jose";

const backendSecret = new TextEncoder().encode(process.env.AUTH_SECRET);

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    GitHub({
      authorization: { params: { prompt: "consent" } },
    }),
    Google({
      authorization: { params: { prompt: "select_account" } },
    }),
  ],
  pages: {
    signIn: "/",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.image = user.image;
      }
      // Sign a backend token (HS256 JWS) on every callback
      token.backendToken = await new SignJWT({
        email: token.email,
        sub: token.sub,
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("24h")
        .sign(backendSecret);
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.image = token.image as string;
      }
      session.backendToken = token.backendToken as string;
      return session;
    },
  },
});
