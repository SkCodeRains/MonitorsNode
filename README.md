# Backend Express In-Memory REST API

A Node.js Express server that manages data in an in-memory array. The array is maintained in RAM and persists as long as the server is running.

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Server
```bash
# Production mode
npm start

# Development mode (auto-reload on save)
npm run dev
```
The server will run on `http://localhost:5000` (or `PORT` defined in `.env`).

---

## API Endpoints

### 1. Store New Data
- **Method**: `POST`
- **URL**: `/api/data` or `/api/items`
- **Headers**: `Content-Type: application/json`
- **Body**:
```json
{
  "data": "{\"sensor\": \"temp\", \"value\": 25.4}"
}
```
- **Response** (`201 Created`):
```json
{
  "success": true,
  "message": "Item stored successfully",
  "item": {
    "id": "20891cb9-58b8-469e-9017-1509eef35dab",
    "data": "{\"sensor\": \"temp\", \"value\": 25.4}",
    "createdAt": "2026-08-23T12:37:26.238Z"
  },
  "totalCount": 1
}
```

---

### 2. Get All Stored Data
- **Method**: `GET`
- **URL**: `/api/data` or `/api/items`
- **Response** (`200 OK`):
```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "id": "20891cb9-58b8-469e-9017-1509eef35dab",
      "data": "{\"sensor\": \"temp\", \"value\": 25.4}",
      "createdAt": "2026-08-23T12:37:26.238Z"
    }
  ]
}
```

---

### 3. Get Single Item by ID
- **Method**: `GET`
- **URL**: `/api/data/:id` or `/api/items/:id`
- **Response** (`200 OK`):
```json
{
  "success": true,
  "data": {
    "id": "20891cb9-58b8-469e-9017-1509eef35dab",
    "data": "{\"sensor\": \"temp\", \"value\": 25.4}",
    "createdAt": "2026-08-23T12:37:26.238Z"
  }
}
```

---

### 4. Delete Single Item by ID
- **Method**: `DELETE`
- **URL**: `/api/data/:id` or `/api/items/:id`
- **Response** (`200 OK`):
```json
{
  "success": true,
  "message": "Item with ID \"20891cb9-58b8-469e-9017-1509eef35dab\" deleted successfully",
  "deletedItem": {
    "id": "20891cb9-58b8-469e-9017-1509eef35dab",
    "data": "{\"sensor\": \"temp\", \"value\": 25.4}",
    "createdAt": "2026-08-23T12:37:26.238Z"
  },
  "remainingCount": 0
}
```

---

### 5. Delete All Items
- **Method**: `DELETE`
- **URL**: `/api/data/all`, `/api/items/all`, `/api/data`, or `/api/items`
- **Response** (`200 OK`):
```json
{
  "success": true,
  "message": "All items deleted successfully from the in-memory array",
  "deletedCount": 2,
  "remainingCount": 0
}
```

---

### 6. Health & Docs
- **Method**: `GET`
- **URL**: `/`
- **Response** (`200 OK`): Returns server status and route list.

---

## Testing the APIs
Run the automated test runner:
```bash
node test-api.js
```
