/**
 * appwrite.js — Appwrite Web SDK client for the ServisAku frontend.
 *
 * Auth (email/password, email OTP, phone OTP) runs through Appwrite; the
 * browser then mints an Appwrite JWT (`account.createJWT()`) that the Express
 * backend verifies to identify the user. Endpoint + project come from env:
 *   VITE_APPWRITE_ENDPOINT   e.g. https://cloud.appwrite.io/v1
 *   VITE_APPWRITE_PROJECT_ID e.g. sgp-6a57e451002b2bb293da
 */
import { Client, Account, ID } from 'appwrite';

export const APPWRITE_ENDPOINT = import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1';
export const APPWRITE_PROJECT_ID = import.meta.env.VITE_APPWRITE_PROJECT_ID || '';

const client = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID);

export const account = new Account(client);
export { client, ID };
