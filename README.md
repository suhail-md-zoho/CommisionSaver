# Commission Saver - WhatsApp-Based Bus Booking Control Layer

## 📋 Project Overview

**Commission Saver** is a WhatsApp-first booking control layer that helps bus operators save 10-15% commission by providing a direct booking channel. The system manages a separate seat quota for WhatsApp bookings, keeping operators in full control without requiring complex integrations with existing systems like Bitla or EzeeInfo.

### Problem Statement

Bus operators lose **10-15% commission** on every ticket booked via OTAs (RedBus, AbhiBus, Paytm). They want a direct booking channel but do not want:
- New complex software
- Risk of double booking
- Deep integration with existing systems (Bitla, EzeeInfo)

### Solution

A **WhatsApp-first booking control layer** that:
- Manages a **separate seat quota** for WhatsApp bookings
- Keeps the **operator fully in control**
- Uses Bitla/EzeeInfo **only for final ticket issuance** (manual process)
- Requires **no API integration** with existing systems

> **Core Concept**: Our system is the source of truth for WhatsApp seats. Bitla/EzeeInfo is used only after confirmation to generate the actual ticket.

---

## 🏗️ System Architecture

### Key Components

1. **Operator Dashboard (Web)** - Simple interface for trip and quota management
2. **WhatsApp Customer Flow** - Structured booking requests via WhatsApp
3. **Seat State Machine** - AVAILABLE → HOLD → CONFIRMED/EXPIRED
4. **Ticket-Based Confirmation** - Booking confirmed only when operator sends ticket on WhatsApp

### Seat State Machine

```
AVAILABLE → HOLD → CONFIRMED
              ↓
           EXPIRED
```

- **HOLD**: Created when customer request is accepted, prevents race conditions, auto-expires after fixed time (default: 10 minutes)
- **CONFIRMED**: Triggered only when operator sends ticket on WhatsApp, decreases available seat count permanently
- **EXPIRED**: If operator doesn't send ticket in time, seats are released back to available pool

### Operator Confirmation Rule

> **A booking is confirmed ONLY when the operator sends the ticket on WhatsApp.**

- Customer acknowledgement ≠ booking
- Operator verbal confirmation ≠ booking
- **Ticket received = booking confirmed**

This ensures consistency without API dependency.

---

## 📊 Database Schema

### Tables

#### `operators`
- Stores operator information
- Fields: `id`, `name`, `phone_number`, `approved`, `created_at`

#### `routes`
- Base route definitions (source → destination)
- Fields: `id`, `operator_id`, `source`, `destination`, `price`, `created_at`
- Note: `departure_time` moved to `trips` table

#### `trips`
- Route + date + time combinations with seat quotas
- Fields: `id`, `route_id`, `journey_date`, `departure_time`, `whatsapp_seat_quota`, `created_at`
- Unique constraint: `(route_id, journey_date, departure_time)`

#### `bookings`
- Customer booking requests with state management
- Fields: `id`, `customer_name`, `customer_phone`, `trip_id`, `seat_count`, `status`, `hold_expires_at`, `ticket_attachment_id`, `ticket_received_at`, `created_at`
- Status values: `hold`, `confirmed`, `expired`

#### `message_logs`
- Tracks all WhatsApp messages sent
- Fields: `id`, `booking_id`, `type`, `sent_at`
- Types: `hold_notification`, `operator_notification`, `confirmation`, `reminder`, `rejection`

#### `ticket_attachments`
- Stores WhatsApp media IDs for tickets
- Fields: `id`, `booking_id`, `media_id`, `media_type`, `media_url`, `received_at`

---

## 🔄 WhatsApp Flow

### Customer Booking Request

Customer sends structured message in one of these formats:

1. **Structured Format:**
   ```
   Route: Mumbai to Pune, Date: 2024-01-15, Time: 08:00, Seats: 2
   ```

2. **Comma-Separated:**
   ```
   Mumbai to Pune, 2024-01-15, 08:00, 2 seats
   ```

3. **Space-Separated:**
   ```
   BOOK Mumbai Pune 2024-01-15 08:00 2
   ```

### System Processing

1. **Parse Request** - Extract route, date, time, seats
2. **Find Route** - Match source/destination (case-insensitive partial match)
3. **Find Trip** - Match route + date + time
4. **Check Availability** - Verify seats available (quota - confirmed - active holds)
5. **Create HOLD** - If available, create booking with HOLD status
6. **Notify Customer** - Send confirmation with booking details
7. **Notify Operator** - Alert operator to contact customer

### Operator Ticket Confirmation

1. **Operator sends ticket** - Image or PDF document via WhatsApp
2. **System detects media** - Identifies image/document attachment
3. **Find active hold** - Matches to most recent active hold for operator's routes
4. **Confirm booking** - Updates status to CONFIRMED, stores media ID
5. **Notify customer** - Sends confirmation message
6. **Update seat count** - Decreases available seats permanently

### Hold Expiration

- Cron job runs every 5 minutes
- Finds all holds where `hold_expires_at <= now()`
- Updates status to `expired`
- Releases seats back to available pool

---

## 🛠️ Implementation Details

### What Was Implemented

#### 1. Database Schema Redesign ✅
- Added `trips` table for route+date+time combinations
- Updated `bookings` to use `trip_id` instead of `route_id` + `journey_date`
- Added `hold_expires_at`, `ticket_attachment_id`, `ticket_received_at` fields
- Added `ticket_attachments` table for media storage
- Removed `departure_time` from `routes` (now in `trips`)

#### 2. Seat State Machine ✅
- HOLD status with auto-expiration
- EXPIRED status for released holds
- CONFIRMED status triggered only by ticket receipt
- Automatic hold expiration cron job (every 5 minutes)

#### 3. WhatsApp Customer Flow ✅
- Message parser supporting multiple input formats
- Route matching (case-insensitive partial match)
- Trip lookup (route + date + time)
- Seat availability checking
- Automatic hold creation with expiration
- Customer and operator notifications

#### 4. Ticket Detection & Confirmation ✅
- Detects image/document attachments from operator
- Automatically confirms booking when ticket received
- Stores ticket media ID in database
- Notifies customer upon confirmation

#### 5. Operator Dashboard ✅
- Web interface at `/` (served from `public/index.html`)
- View all trips with seat statistics (available, held, confirmed)
- Create new trips with route, date, time, and seat quota
- Update seat quotas per trip
- Real-time updates (refreshes every 30 seconds)

#### 6. Trip Management API ✅
- `GET /trip` - List all trips with stats
- `GET /trip/:id` - Get trip details with bookings
- `POST /trip` - Create new trip
- `PATCH /trip/:id/quota` - Update seat quota
- `GET /routes` - List all routes

#### 7. Services ✅
- `messageParser.js` - Parses customer booking requests
- `holdExpiration.js` - Expires holds and releases seats
- `reminder.js` - Sends journey reminders (6 hours before)
- `whatsapp.js` - WhatsApp Cloud API integration

---

## 📁 Project Structure

```
CommisionSaver/
├── database.js              # Database initialization and schema
├── server.js                 # Express server and cron jobs
├── package.json             # Dependencies
├── .env                     # Environment variables (create this)
│
├── models/
│   ├── booking.js          # Booking CRUD operations
│   ├── operator.js         # Operator lookup
│   ├── route.js            # Route operations
│   ├── trip.js             # Trip operations with seat stats
│   └── messageLog.js       # Message logging
│
├── routes/
│   ├── webhook.js          # WhatsApp webhook handler
│   ├── booking.js          # Booking API endpoints (legacy)
│   ├── trip.js             # Trip management API
│   └── routes.js           # Route listing API
│
├── services/
│   ├── whatsapp.js         # WhatsApp Cloud API client
│   ├── messageParser.js    # Customer message parsing
│   ├── holdExpiration.js   # Hold expiration logic
│   └── reminder.js        # Journey reminder service
│
└── public/
    └── index.html          # Operator dashboard
```

---

## 🚀 Setup & Installation

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Meta Developer Account (for WhatsApp Cloud API)
- Public URL for webhook (use ngrok for local testing)

### Step 1: Install Dependencies

```bash
cd CommisionSaver
npm install
```

### Step 2: Get WhatsApp Credentials

1. Go to https://developers.facebook.com/
2. Create a Meta App → Add WhatsApp product
3. Get credentials from WhatsApp → API Setup:
   - **Phone Number ID**
   - **Access Token** (temporary or permanent)
   - **Webhook Verify Token** (create your own secret)

### Step 3: Create `.env` File

Create `.env` in the project root:

```env
# WhatsApp Cloud API Credentials
ACCESS_TOKEN=your_access_token_here
PHONE_NUMBER_ID=your_phone_number_id_here
WEBHOOK_VERIFY_TOKEN=your_webhook_verify_token_here

# Operator Information
OPERATOR_PHONE=1234567890
OPERATOR_NAME=Default Operator

# Application Settings
HOLD_DURATION_MINUTES=10
PORT=3000
```

### Step 4: Configure Webhook

1. Use ngrok for local testing:
   ```bash
   ngrok http 3000
   ```

2. In Meta Developer Console:
   - Webhook URL: `https://your-ngrok-url.ngrok.io/whatsapp/webhook`
   - Verify Token: Same as `WEBHOOK_VERIFY_TOKEN` in `.env`
   - Subscribe to: `messages` events

### Step 5: Start Server

```bash
# Production
npm start

# Development (auto-restart)
npm run dev
```

Server runs on `http://localhost:3000`

---

## 🧪 Testing Guide

### 1. Test Dashboard

1. Open `http://localhost:3000`
2. Create a trip:
   - Select route
   - Set date (tomorrow)
   - Set time (e.g., 08:00)
   - Set WhatsApp seat quota (e.g., 5)
   - Click "Create Trip"

### 2. Test WhatsApp Webhook Verification

```bash
curl "http://localhost:3000/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=your_webhook_verify_token&hub.challenge=test123"
```

Should return: `test123`

### 3. Test Customer Booking

Send WhatsApp message to business number:
```
Route: City A to City B, Date: 2024-01-15, Time: 08:00, Seats: 2
```

Expected:
- System creates HOLD booking
- Customer receives confirmation
- Operator receives notification

### 4. Test Operator Ticket Confirmation

From operator's WhatsApp number, send an image or PDF.

Expected:
- Booking status changes to CONFIRMED
- Customer receives confirmation message
- Seat count decreases

### 5. Test Hold Expiration

Wait for hold to expire (default: 10 minutes), or manually expire via API.

Expected:
- Hold status changes to EXPIRED
- Seats released back to available pool

---

## 🔑 Key Design Decisions

### 1. No Automatic Booking
- System only creates HOLDS, never auto-confirms
- Operator must send ticket to confirm
- Prevents overbooking and gives operator control

### 2. Separate WhatsApp Quota
- WhatsApp bookings use isolated quota
- Independent from OTA inventory
- Operator sets quota per trip

### 3. Ticket-Based Confirmation
- Only ticket receipt confirms booking
- No verbal confirmations or acknowledgements
- Ensures consistency and prevents disputes

### 4. No Bitla/EzeeInfo Integration
- Operator manually issues tickets in existing system
- No API dependencies
- System acts as coordination layer only

### 5. Time-Boxed Holds
- Prevents indefinite seat blocking
- Auto-expires after timeout
- Releases seats back to pool

---

## 📝 API Endpoints

### Webhook
- `GET /whatsapp/webhook` - Webhook verification
- `POST /whatsapp/webhook` - Receive WhatsApp messages

### Trips
- `GET /trip` - List all trips with stats
- `GET /trip/:id` - Get trip details with bookings
- `POST /trip` - Create new trip
- `PATCH /trip/:id/quota` - Update seat quota

### Routes
- `GET /routes` - List all routes

### Health
- `GET /health` - Health check

### Dashboard
- `GET /` - Operator dashboard (served from `public/index.html`)

---

## 🔄 Cron Jobs

### Hold Expiration
- **Schedule**: Every 5 minutes (`*/5 * * * *`)
- **Function**: `expireHolds()`
- **Action**: Finds expired holds and releases seats

### Journey Reminders
- **Schedule**: Every 30 minutes (`*/30 * * * *`)
- **Function**: `sendReminders()`
- **Action**: Sends reminders 6 hours before journey

---

## 🎯 MVP Scope

### Included ✅
- WhatsApp chat flow
- Operator dashboard
- Seat quota management
- HOLD / CONFIRM / EXPIRE logic
- Manual ticket upload to confirm booking
- Seat availability tracking
- Automatic hold expiration

### Explicitly Excluded ❌
- Bitla/EzeeInfo APIs
- Auto seat sync
- Payment processing
- OTA integrations
- Multi-operator support (single operator for now)
- Admin authentication (can be added later)

---

## 🐛 Troubleshooting

### "ACCESS_TOKEN not set" Error
- Check `.env` file exists and has correct values
- Restart server after changing `.env`

### Database Errors
- Delete `database.sqlite` and restart (will recreate schema)
- Check database file permissions

### WhatsApp Webhook Not Receiving Messages
- Ensure webhook URL is publicly accessible (use ngrok)
- Verify webhook is subscribed to `messages` events
- Check verify token matches in `.env`
- Check server logs for webhook errors

### Holds Not Expiring
- Check cron job is running (check server logs)
- Verify `hold_expires_at` is set correctly
- Check database timezone settings

### Dashboard Not Loading
- Check server is running on correct port
- Verify `public/index.html` exists
- Check browser console for errors

---

## 📚 Environment Variables Reference

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `ACCESS_TOKEN` | WhatsApp Cloud API access token | Yes | - |
| `PHONE_NUMBER_ID` | WhatsApp phone number ID | Yes | - |
| `WEBHOOK_VERIFY_TOKEN` | Webhook verification token | Yes | - |
| `OPERATOR_PHONE` | Operator's WhatsApp number | Yes | - |
| `OPERATOR_NAME` | Operator's name | No | "Default Operator" |
| `HOLD_DURATION_MINUTES` | Hold expiration time in minutes | No | 10 |
| `PORT` | Server port | No | 3000 |

---

## 🔮 Future Enhancements (Not in MVP)

- Payment processing integration
- Multi-operator support
- Admin authentication for dashboard
- Booking history and analytics
- SMS fallback if WhatsApp fails
- Advanced reporting and insights
- Customer booking history lookup
- Automated reminder customization

---

## 📞 Support

For issues or questions:
1. Check server logs for error messages
2. Verify all environment variables are set
3. Test webhook verification endpoint
4. Check database for data consistency

---

## 📄 License

ISC

---

**Last Updated**: 2024
**Version**: 1.0.0 (MVP)
