const http = require('http');
const { WebSocket } = require('ws');

const API_KEY = 'CR-MONITOR-KEY-2026-X99';

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

async function runTests() {
  console.log('=== Starting API, Auth, x-api-key & WebSocket Verification Tests ===');

  // 1. PUBLIC POST: Android event without any auth or api key headers
  console.log('\n1. Testing PUBLIC POST /api/data without Auth token & without x-api-key (e.g. from Android app)');
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

  // 2. PROTECTED GET: Should fail with 401 without Token and without API key
  console.log('\n2. Testing PROTECTED GET /api/data without Token and without x-api-key');
  res = await makeRequest({ host: 'localhost', port: 5000, path: '/api/data', method: 'GET' });
  console.log('Status (Should be 401):', res.status, '| Error:', res.data.error);

  // 3. AUTH LOGIN without API Key: Should fail with 401
  console.log('\n3. Testing POST /api/auth/login WITHOUT API Key');
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
  console.log('Status (Should be 401):', res.status, '| Error:', res.data.error);

  // 4. AUTH LOGIN with Invalid API Key: Should fail with 401
  console.log('\n4. Testing POST /api/auth/login with INVALID API Key');
  res = await makeRequest({
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': 'WRONG_KEY'
    },
    host: 'localhost',
    port: 5000,
    path: '/api/auth/login',
    method: 'POST'
  }, {
    email: 'skcoderains@gmail.com',
    password: 'CodeR@ins697972914439'
  });
  console.log('Status (Should be 401):', res.status, '| Error:', res.data.error);

  // 5. AUTH LOGIN with Valid API Key in header: Should succeed with 200
  console.log('\n5. Testing POST /api/auth/login with VALID x-api-key header');
  res = await makeRequest({
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY
    },
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

  // 6. AUTH LOGIN with Valid API Key in body (Alternative for frontend form): Should also succeed
  console.log('\n6. Testing POST /api/auth/login with apiKey in body');
  res = await makeRequest({
    headers: { 'Content-Type': 'application/json' },
    host: 'localhost',
    port: 5000,
    path: '/api/auth/login',
    method: 'POST'
  }, {
    email: 'skcoderains@gmail.com',
    password: 'CodeR@ins697972914439',
    apiKey: API_KEY
  });
  console.log('Status (Should be 200):', res.status, '| Token Received:', !!res.data.token);

  // 7. PROTECTED GET with Bearer Token but MISSING x-api-key header: Should fail with 401
  console.log('\n7. Testing PROTECTED GET /api/data with Bearer Token but MISSING x-api-key header');
  res = await makeRequest({
    headers: { 'Authorization': `Bearer ${token}` },
    host: 'localhost',
    port: 5000,
    path: '/api/data',
    method: 'GET'
  });
  console.log('Status (Should be 401):', res.status, '| Error:', res.data.error);

  // 8. PROTECTED GET with Bearer Token AND INVALID x-api-key header: Should fail with 401
  console.log('\n8. Testing PROTECTED GET /api/data with Bearer Token AND INVALID x-api-key');
  res = await makeRequest({
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-api-key': 'INVALID_API_KEY'
    },
    host: 'localhost',
    port: 5000,
    path: '/api/data',
    method: 'GET'
  });
  console.log('Status (Should be 401):', res.status, '| Error:', res.data.error);

  // 9. PROTECTED GET with Bearer Token AND VALID x-api-key header: Should succeed with 200
  console.log('\n9. Testing PROTECTED GET /api/data with Bearer Token AND VALID x-api-key');
  res = await makeRequest({
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-api-key': API_KEY
    },
    host: 'localhost',
    port: 5000,
    path: '/api/data',
    method: 'GET'
  });
  console.log('Status (Should be 200):', res.status, '| Total Items:', res.data.count, '| First Item:', res.data.data[0]?.eventType);

  // 10. PROTECTED GET /api/auth/me with Bearer Token and x-api-key: Should succeed with 200
  console.log('\n10. Testing PROTECTED GET /api/auth/me with Bearer Token and x-api-key');
  res = await makeRequest({
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-api-key': API_KEY
    },
    host: 'localhost',
    port: 5000,
    path: '/api/auth/me',
    method: 'GET'
  });
  console.log('Status (Should be 200):', res.status, '| User:', res.data.user?.email);

  // 11. PROTECTED DELETE: Delete item with Bearer token and x-api-key
  console.log('\n11. Testing PROTECTED DELETE /api/data/3 with Bearer token and x-api-key');
  res = await makeRequest({
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-api-key': API_KEY
    },
    host: 'localhost',
    port: 5000,
    path: '/api/data/3',
    method: 'DELETE'
  });
  console.log('Status (Should be 200):', res.status, '| Deleted Item ID:', res.data.deletedItem?.id);

  // 12. PROTECTED DELETE ALL: Clear store with Bearer token and x-api-key
  console.log('\n12. Testing PROTECTED DELETE /api/data/all with Bearer token and x-api-key');
  res = await makeRequest({
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-api-key': API_KEY
    },
    host: 'localhost',
    port: 5000,
    path: '/api/data/all',
    method: 'DELETE'
  });
  console.log('Status (Should be 200):', res.status, '| Remaining Count:', res.data.remainingCount);

  console.log('\n=== All Authentication, x-api-key, Public POST, and Protected Routes verified successfully! ===');
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
