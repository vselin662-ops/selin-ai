/**
 * Selin Encrypted Stream Tunnel (SEST) - Local Client Test Script
 * Run this script in your local computer terminal:
 * node sest-client.js <username> <password>
 */

const http = require('https'); // or http depending on protocol

const args = process.argv.slice(2);
const username = args[0] || 'selin_test';
const password = args[1] || 'testpass';
const serverUrl = 'https://ais-dev-fzpjlzo5denvk4xxawb3rd-163629687200.us-west1.run.app/tunnel/handshake';

console.log(`🛡️ [SEST Client] Connecting to Selin AI Cloud Tunnel...`);
console.log(`🌐 Server: ${serverUrl}`);
console.log(`👤 Username: ${username}`);

const data = JSON.stringify({ username, password });

const urlObj = new URL(serverUrl);
const options = {
  hostname: urlObj.hostname,
  port: 443,
  path: urlObj.pathname,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = require('https').request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log(`\n📥 Response Status: ${res.statusCode}`);
    try {
      const json = JSON.parse(body);
      console.log('📦 Response Body:', JSON.stringify(json, null, 2));
      if (res.statusCode === 200 && json.success) {
        console.log('\n✅ [SUCCESS] SEST Encrypted Tunnel Handshake Established!');
        console.log(`🔑 Active Session ID: ${json.sessionId}`);
        console.log(`🚀 Protocol: ${json.protocol}`);
      } else {
        console.log('\n❌ [FAILED] Authentication or Handshake rejected.');
      }
    } catch (e) {
      console.log('Raw Body:', body);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Connection Error:', error);
});

req.write(data);
req.end();
