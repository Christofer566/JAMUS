const { google } = require('googleapis');
const readline = require('readline');

// Google OAuth 설정
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

// 환경변수에서 읽기 (또는 직접 입력)
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'YOUR_CLIENT_ID';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'YOUR_CLIENT_SECRET';
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback';

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

async function generateTokens() {
  console.log('=== Google OAuth Token Generator ===\n');
  
  // Step 1: Generate authorization URL
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent' // Force consent screen to get refresh token
  });

  console.log('1. Open this URL in your browser:');
  console.log('\n' + authUrl + '\n');
  
  console.log('2. After authorization, you will be redirected to a URL.');
  console.log('3. Copy the entire redirect URL and paste it below.\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('Paste the redirect URL here: ', async (redirectUrl) => {
    try {
      // Extract code from redirect URL
      const url = new URL(redirectUrl);
      const code = url.searchParams.get('code');
      
      if (!code) {
        console.error('\n❌ Error: Could not find authorization code in URL');
        rl.close();
        return;
      }

      console.log('\n✅ Authorization code found!');
      console.log('📡 Exchanging code for tokens...\n');

      // Exchange code for tokens
      const { tokens } = await oauth2Client.getToken(code);
      
      console.log('=== ✅ SUCCESS! ===\n');
      console.log('Add these environment variables to your Vercel project:\n');
      console.log('GOOGLE_ACCESS_TOKEN=' + tokens.access_token);
      console.log('GOOGLE_REFRESH_TOKEN=' + tokens.refresh_token);
      console.log('\nAlso make sure you have:');
      console.log('GOOGLE_CLIENT_ID=' + CLIENT_ID);
      console.log('GOOGLE_CLIENT_SECRET=' + CLIENT_SECRET);
      console.log('GOOGLE_REDIRECT_URI=' + REDIRECT_URI);
      
      console.log('\n📝 Token expiry:', new Date(tokens.expiry_date).toLocaleString());
      
    } catch (error) {
      console.error('\n❌ Error getting tokens:', error.message);
    }
    
    rl.close();
  });
}

// Check if required env vars are set
if (CLIENT_ID === 'YOUR_CLIENT_ID' || CLIENT_SECRET === 'YOUR_CLIENT_SECRET') {
  console.error('❌ Error: Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables');
  console.error('\nYou can either:');
  console.error('1. Set them in your .env file');
  console.error('2. Pass them as command line arguments:');
  console.error('   GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy node scripts/generate-google-tokens.js');
  process.exit(1);
}

generateTokens();
