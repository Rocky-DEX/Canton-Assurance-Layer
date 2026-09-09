import NextAuth, { type DefaultSession } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Nodemailer from "next-auth/providers/nodemailer";
import { appendFileSync } from "node:fs";
import { createTransport } from "nodemailer";

import { prisma } from "@/lib/db";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

/**
 * Sends the magic link, or in development without a mail server, writes it to
 * `.devmail.log` where /dev/mail shows it. A sign-in flow that needs SMTP to
 * be tried locally is a flow nobody tries locally.
 */
async function sendVerificationRequest(params: {
  identifier: string;
  url: string;
  provider: { server?: unknown; from?: string };
}) {
  const { identifier, url, provider } = params;
  const server = process.env.EMAIL_SERVER;
  if (!server) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("EMAIL_SERVER is not configured");
    }
    appendFileSync(
      ".devmail.log",
      JSON.stringify({ to: identifier, url, at: new Date().toISOString() }) + "\n"
    );
    console.log(`[dev mail] sign-in link for ${identifier}: ${url}`);
    return;
  }
  const host = new URL(url).host;
  const transport = createTransport(server);
  await transport.sendMail({
    to: identifier,
    from: provider.from,
    subject: `Sign in to ${host}`,
    text: `Sign in to ${host}\n\n${url}\n\nIf you did not request this email you can safely ignore it.`,
    html: `<p>Sign in to <strong>${host}</strong></p><p><a href="${url}">Sign in</a></p><p style="color:#666">If you did not request this email you can safely ignore it.</p>`,
  });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database", maxAge: 14 * 24 * 60 * 60 },
  trustHost: true,
  providers: [
    Nodemailer({
      server: process.env.EMAIL_SERVER || "smtp://localhost:25",
      from: process.env.EMAIL_FROM,
      maxAge: 15 * 60,
      sendVerificationRequest,
    }),
  ],
  pages: {
    signIn: "/login",
    verifyRequest: "/login/sent",
    error: "/login",
  },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
