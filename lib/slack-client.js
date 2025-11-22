// Slack 메시지 전송
export async function sendSlackMessage(channel, text) {
  console.log('=== sendSlackMessage START ===');
  console.log('SLACK_BOT_TOKEN exists:', !!process.env.SLACK_BOT_TOKEN);
  console.log('Channel:', channel);
  console.log('Text:', text);
  
  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      channel,
      text
    })
  });
  
  const data = await response.json();
  console.log('=== Slack API Response ===');
  console.log(JSON.stringify(data, null, 2));
  console.log('=== sendSlackMessage END ===');
  return data;
}
