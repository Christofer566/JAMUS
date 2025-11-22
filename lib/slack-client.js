export async function sendSlackMessage(channel, message) { // message 파라미터로 변경
  console.log('=== sendSlackMessage START ===');
  console.log('SLACK_BOT_TOKEN exists:', !!process.env.SLACK_BOT_TOKEN);
  console.log('Channel:', channel);
  console.log('Message:', JSON.stringify(message, null, 2)); // 전체 메시지 출력
  
  const payload = { channel };

  if (typeof message === 'string') {
    payload.text = message;
  } else if (typeof message === 'object' && message !== null) {
    // message 객체에 text나 blocks가 직접 포함되어 있다고 가정
    // Slack Block Kit 형식이라면 blocks를 사용
    if (message.text) payload.text = message.text;
    if (message.blocks) payload.blocks = message.blocks;
  } else {
    console.error('Invalid message format for sendSlackMessage:', message);
    throw new Error('Invalid message format');
  }

  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload) // payload 객체를 전송
  });
  
  const data = await response.json();
  console.log('=== Slack API Response ===');
  console.log(JSON.stringify(data, null, 2));
  console.log('=== sendSlackMessage END ===');
  return data;
}
