const { getDatabase } = require('../database');

/**
 * Create a new message log entry
 * @param {Object} logData - Message log data
 * @param {number|null} logData.booking_id - Booking ID (optional)
 * @param {string} logData.type - Message type (e.g., 'notification', 'reminder', 'confirmation', 'rejection')
 * @param {Date} logData.sent_at - Timestamp when message was sent (optional, defaults to now)
 * @returns {Promise<Object>} Created message log object with id
 */
async function create(logData) {
  const db = await getDatabase();
  
  const {
    booking_id = null,
    type,
    sent_at = new Date().toISOString()
  } = logData;

  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO message_logs (booking_id, type, sent_at)
       VALUES (?, ?, ?)`,
      [booking_id, type, sent_at],
      function (err) {
        if (err) {
          reject(err);
          return;
        }
        
        // Fetch the created message log
        findById(this.lastID)
          .then(log => resolve(log))
          .catch(reject);
      }
    );
  });
}

/**
 * Find message log by ID
 * @param {number} id - Message log ID
 * @returns {Promise<Object|null>} Message log object or null if not found
 */
async function findById(id) {
  const db = await getDatabase();
  
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM message_logs WHERE id = ?',
      [id],
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
 * Find message logs by booking ID
 * @param {number} bookingId - Booking ID
 * @returns {Promise<Array>} Array of message log objects
 */
async function findByBookingId(bookingId) {
  const db = await getDatabase();
  
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM message_logs WHERE booking_id = ? ORDER BY sent_at DESC',
      [bookingId],
      (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows || []);
      }
    );
  });
}

module.exports = {
  create,
  findById,
  findByBookingId
};
