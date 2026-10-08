import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

// Uses Application Default Credentials (automatic on Cloud Run).
initializeApp({ projectId: process.env.GOOGLE_CLOUD_PROJECT });
export const db = getFirestore();
export const auth = getAuth();
