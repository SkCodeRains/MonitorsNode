const http = require('http');

const samplePayload = {
  id: 3,
  eventType: "CALL_LOG",
  source: "TELEPHONY",
  timestamp: 1724431840000,
  payload: JSON.stringify({
    number: "+19876543210",
    name: "Mom",
    durationSeconds: 145,
    callType: "INCOMING"
  })
};

const data = JSON.stringify(samplePayload);

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/data',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, (res) => {
  let responseData = '';
  res.on('data', (chunk) => { responseData += chunk; });
  res.on('end', () => {
    console.log(`Status Code: ${res.statusCode}`);
    console.log('Response Body:', JSON.parse(responseData));
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.write(data);
req.end();
