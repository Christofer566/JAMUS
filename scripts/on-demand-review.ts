import { GoogleGenerativeAI } from '@google/generative-ai';

async function listAvailableModels() {
  console.log('--- Listing Available Gemini Models ---');

  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY is not set!');
    process.exit(1);
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    
    console.log(`Fetching from: ${url.replace(apiKey, '***')}`);

    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed with status ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    
    console.log('✅ Successfully fetched model list:');
    console.log(JSON.stringify(data, null, 2));

  } catch (error: any) {
    console.error('❌ Failed to list Gemini models:', error.message);
    process.exit(1);
  }
}

listAvailableModels();