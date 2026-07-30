/**
 * appwrite.js — server-side Appwrite helper for the ServisAku Express backend.
 *
 * The browser authenticates with Appwrite and sends an Appwrite JWT. We verify
 * it here by creating a JWT-scoped client and calling account.get() — a valid
 * JWT returns the Appwrite user; an invalid/expired one throws. No admin API
 * key is needed for verification (the optional APPWRITE_API_KEY is only for
 * server-side user management, e.g. syncing roles/labels).
 */
import { Client, Account } from 'node-appwrite';

export const APPWRITE_ENDPOINT = process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1';
export const APPWRITE_PROJECT_ID = process.env.APPWRITE_PROJECT_ID || '';

export const isAppwriteConfigured = () => !!APPWRITE_PROJECT_ID;

/**
 * Verify an Appwrite user JWT and return the Appwrite account
 * ({ $id, email, phone, name, ... }). Throws if the JWT is invalid.
 */
export async function getAppwriteUserFromJWT(jwt) {
  const client = new Client()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT_ID)
    .setJWT(jwt);
  return new Account(client).get();
}
