#!/usr/bin/env node

/**
 * Google OAuth Token Generator
 * 
 * This script helps you get OAuth tokens for Google Calendar/Gmail API access.
 * 
 * Setup:
 * 1. Go to Google Cloud Console (https://console.cloud.google.com/)
 * 2. Create a new project or select existing one
 * 3. Enable Google Calendar API and Gmail API
 * 4. Create OAuth 2.0 credentials (Desktop app)
 * 5. Download the credentials and update CLIENT_ID and CLIENT_SECRET below
 * 6. Run: node scripts/get-google-token.js
 * 
 * SECURITY WARNING:
 * - This file is in .gitignore - DO NOT commit it with real credentials
 * - Keep your CLIENT_SECRET private
 */

const readline = require('readline');
const { google } = require('googleapis');

// ⚠️ REPLACE THESE WITH YOUR ACTUAL CREDENTIALS
const CLIENT_ID = 'YOUR_CLIENT_ID_HERE';
const CLIENT_SECRET = 'YOUR_CLIENT_SECRET_HERE';
const REDIRECT_URI = 'http://localhost:3000/oauth/callback';

// Scopes for Google Calendar and Gmail
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send'
];

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

// Generate auth URL
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent'
});

console.log('\n🔐 Google OAuth Token Generator\n');
console.log('===========================\n');
console.log('Step 1: Open this URL in your browser:\n');
console.log(authUrl);
console.log('\n===========================\n');
console.log('Step 2: Authorize the app and copy the authorization code\n');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Step 3: Paste the authorization code here: ', async (code) => {
  try {
    const { tokens } = await oauth2Client.getToken(code);
    
    console.log('\n✅ Success! Here are your tokens:\n');
    console.log('===========================\n');
    console.log('Add these to your .env file:\n');
    console.log(`GOOGLE_ACCESS_TOKEN=${tokens.access_token}`);
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log('\n===========================\n');
    
    if (!tokens.refresh_token) {
      console.log('⚠️  Warning: No refresh_token received!');
      console.log('   Make sure your email is added as a "Test User" in OAuth consent screen.');
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
  
  rl.close();
});
