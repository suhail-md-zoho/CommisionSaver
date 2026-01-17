const axios = require('axios');

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const API_VERSION = 'v18.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;

/**
 * Normalize phone number for WhatsApp Cloud API
 * Removes +, spaces, and ensures proper format
 * @param {string} phoneNumber - Phone number in any format
 * @returns {string} Normalized phone number
 */
function normalizePhoneNumber(phoneNumber) {
  // Remove +, spaces, dashes, and parentheses
  return phoneNumber.replace(/[\s+\-()]/g, '');
}

/**
 * Send WhatsApp message via Cloud API
 * @param {string} phoneNumber - Recipient phone number
 * @param {string} message - Message text to send
 * @returns {Promise<Object>} API response
 */
async function sendMessage(phoneNumber, message) {
  if (!ACCESS_TOKEN) {
    throw new Error('ACCESS_TOKEN environment variable is not set');
  }

  if (!PHONE_NUMBER_ID) {
    throw new Error('PHONE_NUMBER_ID environment variable is not set');
  }

  if (!phoneNumber) {
    throw new Error('Phone number is required');
  }

  if (!message) {
    throw new Error('Message is required');
  }

  const normalizedPhone = normalizePhoneNumber(phoneNumber);

  const payload = {
    messaging_product: 'whatsapp',
    to: normalizedPhone,
    type: 'text',
    text: {
      body: message
    }
  };

  try {
    const response = await axios.post(BASE_URL, payload, {
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data;
  } catch (error) {
    // Log error details for debugging
    if (error.response) {
      console.error('WhatsApp API Error:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
      throw new Error(`WhatsApp API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      console.error('WhatsApp API Request Error:', error.message);
      throw new Error(`WhatsApp API Request Error: ${error.message}`);
    } else {
      console.error('WhatsApp API Error:', error.message);
      throw error;
    }
  }
}

module.exports = {
  sendMessage
};
