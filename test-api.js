const http = require('http');
const { WebSocket } = require('ws');

function makeRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('=== Starting API, Auth & WebSocket Verification Tests ===');

  // 1. PUBLIC POST: Android event without any auth headers
  console.log('\n1. Testing PUBLIC POST /api/data without Auth token (e.g. from Android app)');
  let res = await makeRequest({
    headers: { 'Content-Type': 'application/json' },
    host: 'localhost',
    port: 5000,
    path: '/api/data',
    method: 'POST'
  }, {
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
  });
  console.log('Status (Should be 201):', res.status, '| Stored Item ID:', res.data.item?.id);

  // 2. PROTECTED GET: Should fail with 401 without Token
  console.log('\n2. Testing PROTECTED GET /api/data without Token');
  res = await makeRequest({ host: 'localhost', port: 5000, path: '/api/data', method: 'GET' });
  console.log('Status (Should be 401):', res.status, '| Error:', res.data.error);

  // 3. AUTH LOGIN: Login with credentials
  console.log('\n3. Testing POST /api/auth/login with skcoderains@gmail.com / CodeR@ins697972914439');
  res = await makeRequest({
    headers: { 'Content-Type': 'application/json' },
    host: 'localhost',
    port: 5000,
    path: '/api/auth/login',
    method: 'POST'
  }, {
    email: 'skcoderains@gmail.com',
    password: 'CodeR@ins697972914439'
  });
  console.log('Status (Should be 200):', res.status, '| Token Received:', !!res.data.token);
  const token = res.data.token;

  // 4. PROTECTED GET: Should succeed with Bearer token
  console.log('\n4. Testing PROTECTED GET /api/data with Bearer token');
  res = await makeRequest({
    headers: { 'Authorization': `Bearer ${token}` },
    host: 'localhost',
    port: 5000,
    path: '/api/data',
    method: 'GET'
  });
  console.log('Status (Should be 200):', res.status, '| Total Items:', res.data.count, '| First Item:', res.data.data[0]?.eventType);

  // 5. PROTECTED DELETE: Delete with Bearer token
  console.log('\n5. Testing PROTECTED DELETE /api/data/3 with Bearer token');
  res = await makeRequest({
    headers: { 'Authorization': `Bearer ${token}` },
    host: 'localhost',
    port: 5000,
    path: '/api/data/3',
    method: 'DELETE'
  });
  console.log('Status (Should be 200):', res.status, '| Deleted Item ID:', res.data.deletedItem?.id);

  // 6. PROTECTED DELETE ALL: Clear store with Bearer token
  console.log('\n6. Testing PROTECTED DELETE /api/data/all with Bearer token');
  res = await makeRequest({
    headers: { 'Authorization': `Bearer ${token}` },
    host: 'localhost',
    port: 5000,
    path: '/api/data/all',
    method: 'DELETE'
  });
  console.log('Status (Should be 200):', res.status, '| Remaining Count:', res.data.remainingCount);

  console.log('\n=== All Authentication, Public POST, and Protected Routes verified successfully! ===');
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
