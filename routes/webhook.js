const express = require('express');
const router = express.Router();
const operatorModel = require('../models/operator');
const bookingModel = require('../models/booking');
const routeModel = require('../models/route');
const messageLogModel = require('../models/messageLog');
const whatsappService = require('../services/whatsapp');
const { getDatabase } = require('../database');

const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;

/**
 * Normalize phone number for matching (remove +, spaces, etc.)
 * @param {string} phoneNumber - Phone number in any format
 * @returns {string} Normalized phone number
 */
function normalizePhoneNumber(phoneNumber) {
  // Remove +, spaces, dashes, and parentheses
  return phoneNumber.replace(/[\s+\-()]/g, '');
}

/**
 * Get the first route from database (default route for bookings)
 * @returns {Promise<Object|null>} First route object or null if not found
 */
async function getFirstRoute() {
  const db = await getDatabase();
  
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM routes ORDER BY id ASC LIMIT 1',
      [],
      (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row || null);
      }
    );
  });
}

/**
 * Find the latest pending booking
 * @returns {Promise<Object|null>} Latest pending booking or null if not found
 */
async function getLatestPendingBooking() {
  const db = await getDatabase();
  
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM bookings WHERE status = ? ORDER BY created_at DESC LIMIT 1',
      ['pending'],
      (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row || null);
      }
    );
  });
}

/**
 * GET /whatsapp/webhook - Webhook verification endpoint
 * WhatsApp Cloud API requires this for webhook setup
 */
router.get('/whatsapp/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Check if mode and token are present
  if (mode && token) {
    // Check if mode is 'subscribe' and token matches
    if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
      console.log('Webhook verified');
      res.status(200).send(challenge);
    } else {
      // Token mismatch
      console.log('Webhook verification failed: token mismatch');
      res.sendStatus(403);
    }
  } else {
    // Missing required parameters
    console.log('Webhook verification failed: missing parameters');
    res.sendStatus(400);
  }
});

/**
 * POST /whatsapp/webhook - Handle incoming WhatsApp messages
 */
router.post('/whatsapp/webhook', async (req, res) => {
  try {
    // Always return 200 to WhatsApp to avoid retries
    res.status(200).send('OK');

    // Extract webhook data
    const body = req.body;
    
    // WhatsApp sends data in entry[0].changes[0].value
    if (!body.entry || !body.entry[0] || !body.entry[0].changes || !body.entry[0].changes[0]) {
      console.log('Invalid webhook payload structure');
      return;
    }

    const change = body.entry[0].changes[0];
    
    // Check if this is a messages webhook
    if (change.value && change.value.messages && change.value.messages[0]) {
      const message = change.value.messages[0];
      const from = message.from; // Phone number
      const messageType = message.type;
      
      // Only process text messages
      if (messageType !== 'text') {
        console.log(`Ignoring non-text message type: ${messageType}`);
        return;
      }

      const messageText = message.text?.body || '';
      const normalizedFrom = normalizePhoneNumber(from);

      console.log(`Received message from ${normalizedFrom}: ${messageText}`);

      // Identify sender: operator or customer
      const operator = await operatorModel.findByPhone(normalizedFrom);
      
      if (operator) {
        // Operator message handling
        await handleOperatorMessage(normalizedFrom, messageText.toUpperCase().trim());
      } else {
        // Customer message handling
        await handleCustomerMessage(normalizedFrom, messageText.toUpperCase().trim());
      }
    } else {
      console.log('No messages in webhook payload');
    }
  } catch (error) {
    // Log error but don't throw (already sent 200 response)
    console.error('Error processing webhook:', error);
  }
});

/**
 * Handle customer messages
 * @param {string} phoneNumber - Customer phone number
 * @param {string} messageText - Message text (uppercase, trimmed)
 */
async function handleCustomerMessage(phoneNumber, messageText) {
  if (messageText === 'BOOK') {
    // Create booking
    await createBooking(phoneNumber);
  } else {
    console.log(`Customer ${phoneNumber} sent unrecognized message: ${messageText}`);
  }
}

/**
 * Handle operator messages
 * @param {string} phoneNumber - Operator phone number
 * @param {string} messageText - Message text (uppercase, trimmed)
 */
async function handleOperatorMessage(phoneNumber, messageText) {
  if (messageText === 'YES') {
    // Confirm booking
    await confirmBooking(phoneNumber);
  } else if (messageText === 'NO') {
    // Reject booking
    await rejectBooking(phoneNumber);
  } else {
    console.log(`Operator ${phoneNumber} sent unrecognized message: ${messageText}`);
  }
}

/**
 * Create a new booking when customer sends "BOOK"
 * @param {string} customerPhone - Customer phone number
 */
async function createBooking(customerPhone) {
  try {
    // Get default route (first route in database)
    const route = await getFirstRoute();
    
    if (!route) {
      console.error('No routes found in database. Cannot create booking.');
      await whatsappService.sendMessage(
        customerPhone,
        'Sorry, no routes are available at the moment. Please try again later.'
      );
      return;
    }

    // Calculate journey date (tomorrow)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const journeyDate = tomorrow.toISOString().split('T')[0]; // YYYY-MM-DD format

    // Create booking
    const booking = await bookingModel.create({
      customer_name: 'Customer', // Default name, can be extracted from WhatsApp profile if available
      customer_phone: customerPhone,
      route_id: route.id,
      journey_date: journeyDate,
      seat_count: 1, // Default seat count
      status: 'pending'
    });

    console.log(`Booking created: ID ${booking.id} for customer ${customerPhone}`);

    // Get operator phone number
    const operator = await operatorModel.findByPhone(process.env.OPERATOR_PHONE || '1234567890');
    
    if (!operator) {
      console.error('No operator found. Cannot send notification.');
      return;
    }

    // Get route details for notification
    const routeDetails = await routeModel.findById(route.id);
    
    // Send notification to operator
    const operatorMessage = `New Booking Request!\n\n` +
      `Booking ID: ${booking.id}\n` +
      `Customer: ${customerPhone}\n` +
      `Route: ${routeDetails.source} → ${routeDetails.destination}\n` +
      `Date: ${journeyDate}\n` +
      `Time: ${routeDetails.departure_time}\n` +
      `Seats: ${booking.seat_count}\n` +
      `Price: ₹${routeDetails.price}\n\n` +
      `Reply YES to confirm or NO to reject.`;

    await whatsappService.sendMessage(operator.phone_number, operatorMessage);
    
    // Log notification message
    await messageLogModel.create({
      booking_id: booking.id,
      type: 'notification'
    });

    // Send confirmation to customer
    const customerMessage = `Your booking request has been received!\n\n` +
      `Booking ID: ${booking.id}\n` +
      `Route: ${routeDetails.source} → ${routeDetails.destination}\n` +
      `Date: ${journeyDate}\n` +
      `Time: ${routeDetails.departure_time}\n` +
      `Seats: ${booking.seat_count}\n` +
      `Price: ₹${routeDetails.price}\n\n` +
      `We will confirm your booking shortly.`;

    await whatsappService.sendMessage(customerPhone, customerMessage);
    
    console.log(`Booking notification sent to operator and customer`);
  } catch (error) {
    console.error('Error creating booking:', error);
    // Try to notify customer of error
    try {
      await whatsappService.sendMessage(
        customerPhone,
        'Sorry, there was an error processing your booking request. Please try again later.'
      );
    } catch (notifyError) {
      console.error('Error notifying customer:', notifyError);
    }
  }
}

/**
 * Confirm booking when operator sends "YES"
 * @param {string} operatorPhone - Operator phone number
 */
async function confirmBooking(operatorPhone) {
  try {
    // Find latest pending booking
    const booking = await getLatestPendingBooking();
    
    if (!booking) {
      console.log('No pending bookings found for confirmation');
      await whatsappService.sendMessage(
        operatorPhone,
        'No pending bookings found to confirm.'
      );
      return;
    }

    // Update booking status
    const updatedBooking = await bookingModel.updateStatus(booking.id, 'confirmed');
    
    if (!updatedBooking) {
      console.error('Failed to update booking status');
      return;
    }

    console.log(`Booking ${booking.id} confirmed by operator ${operatorPhone}`);

    // Get route details
    const route = await routeModel.findById(booking.route_id);
    
    // Send confirmation to customer
    const customerMessage = `✅ Your booking has been confirmed!\n\n` +
      `Booking ID: ${booking.id}\n` +
      `Route: ${route.source} → ${route.destination}\n` +
      `Date: ${booking.journey_date}\n` +
      `Time: ${route.departure_time}\n` +
      `Seats: ${booking.seat_count}\n` +
      `Price: ₹${route.price}\n\n` +
      `Thank you for choosing us!`;

    await whatsappService.sendMessage(booking.customer_phone, customerMessage);
    
    // Log confirmation message
    await messageLogModel.create({
      booking_id: booking.id,
      type: 'confirmation'
    });

    // Notify operator
    await whatsappService.sendMessage(
      operatorPhone,
      `Booking ${booking.id} has been confirmed and customer has been notified.`
    );

    console.log(`Booking confirmation sent to customer ${booking.customer_phone}`);
  } catch (error) {
    console.error('Error confirming booking:', error);
    // Try to notify operator of error
    try {
      await whatsappService.sendMessage(
        operatorPhone,
        'Sorry, there was an error confirming the booking. Please try again.'
      );
    } catch (notifyError) {
      console.error('Error notifying operator:', notifyError);
    }
  }
}

/**
 * Reject booking when operator sends "NO"
 * @param {string} operatorPhone - Operator phone number
 */
async function rejectBooking(operatorPhone) {
  try {
    // Find latest pending booking
    const booking = await getLatestPendingBooking();
    
    if (!booking) {
      console.log('No pending bookings found for rejection');
      await whatsappService.sendMessage(
        operatorPhone,
        'No pending bookings found to reject.'
      );
      return;
    }

    // Update booking status
    const updatedBooking = await bookingModel.updateStatus(booking.id, 'rejected');
    
    if (!updatedBooking) {
      console.error('Failed to update booking status');
      return;
    }

    console.log(`Booking ${booking.id} rejected by operator ${operatorPhone}`);

    // Get route details
    const route = await routeModel.findById(booking.route_id);
    
    // Send rejection to customer
    const customerMessage = `❌ Your booking request has been rejected.\n\n` +
      `Booking ID: ${booking.id}\n` +
      `Route: ${route.source} → ${route.destination}\n` +
      `Date: ${booking.journey_date}\n\n` +
      `We apologize for the inconvenience. Please contact us for alternative options.`;

    await whatsappService.sendMessage(booking.customer_phone, customerMessage);
    
    // Log rejection message
    await messageLogModel.create({
      booking_id: booking.id,
      type: 'rejection'
    });

    // Notify operator
    await whatsappService.sendMessage(
      operatorPhone,
      `Booking ${booking.id} has been rejected and customer has been notified.`
    );

    console.log(`Booking rejection sent to customer ${booking.customer_phone}`);
  } catch (error) {
    console.error('Error rejecting booking:', error);
    // Try to notify operator of error
    try {
      await whatsappService.sendMessage(
        operatorPhone,
        'Sorry, there was an error rejecting the booking. Please try again.'
      );
    } catch (notifyError) {
      console.error('Error notifying operator:', notifyError);
    }
  }
}

module.exports = router;
