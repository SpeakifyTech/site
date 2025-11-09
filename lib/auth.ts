import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { getDb, getMongoClient } from "@/lib/db";

const [db, client] = await Promise.all([getDb(), getMongoClient()]);

export const auth = betterAuth({
  trustedOrigins: [
    "http://localhost:3000",
    "http://10.90.86.105:3000"
  ],
  database: mongodbAdapter(db, {
    client,
    transaction: false,
  }),
  // ONLY WHILE USING LIVE SHARE
  cookie: {
    sameSite: "none",
    secure: process.env.NODE_ENV !== "development",
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
});
