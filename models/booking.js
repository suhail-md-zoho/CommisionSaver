const { getDatabase } = require('../database');

/**
 * Create a new booking
 * @param {Object} bookingData - Booking data
 * @param {string} bookingData.customer_name - Customer name (optional)
 * @param {string} bookingData.customer_phone - Customer phone number
 * @param {number} bookingData.route_id - Route ID
 * @param {string} bookingData.journey_date - Journey date (YYYY-MM-DD)
 * @param {number} bookingData.seat_count - Number of seats (default: 1)
 * @param {string} bookingData.status - Booking status (default: 'pending')
 * @returns {Promise<Object>} Created booking object with id
 */
async function create(bookingData) {
  const db = await getDatabase();
  
  const {
    customer_name = null,
    customer_phone,
    route_id,
    journey_date,
    seat_count = 1,
    status = 'pending'
  } = bookingData;

  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO bookings (customer_name, customer_phone, route_id, journey_date, seat_count, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [customer_name, customer_phone, route_id, journey_date, seat_count, status],
      function (err) {
        if (err) {
          reject(err);
          return;
        }
        
        // Fetch the created booking
        findById(this.lastID)
          .then(booking => resolve(booking))
          .catch(reject);
      }
    );
  });
}

/**
 * Find booking by ID
 * @param {number} id - Booking ID
 * @returns {Promise<Object|null>} Booking object or null if not found
 */
async function findById(id) {
  const db = await getDatabase();
  
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM bookings WHERE id = ?',
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
 * Find bookings by customer phone number
 * @param {string} phoneNumber - Customer phone number
 * @returns {Promise<Array>} Array of booking objects
 */
async function findByPhone(phoneNumber) {
  const db = await getDatabase();
  
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM bookings WHERE customer_phone = ? ORDER BY created_at DESC',
      [phoneNumber],
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

/**
 * Update booking status
 * @param {number} id - Booking ID
 * @param {string} status - New status ('pending', 'confirmed', 'rejected')
 * @returns {Promise<Object|null>} Updated booking object or null if not found
 */
async function updateStatus(id, status) {
  const db = await getDatabase();
  
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE bookings SET status = ? WHERE id = ?',
      [status, id],
      function (err) {
        if (err) {
          reject(err);
          return;
        }
        
        if (this.changes === 0) {
          resolve(null);
          return;
        }
        
        // Fetch the updated booking
        findById(id)
          .then(booking => resolve(booking))
          .catch(reject);
      }
    );
  });
}

/**
 * Check if booking has a reminder sent (helper for reminder service)
 * @param {number} bookingId - Booking ID
 * @param {string} type - Message type (default: 'reminder')
 * @returns {Promise<boolean>} True if reminder exists, false otherwise
 */
async function hasReminder(bookingId, type = 'reminder') {
  const db = await getDatabase();
  
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT id FROM message_logs WHERE booking_id = ? AND type = ?',
      [bookingId, type],
      (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(!!row);
      }
    );
  });
}

/**
 * Find confirmed bookings that need reminders (6 hours before journey)
 * @param {Date} currentTime - Current time
 * @returns {Promise<Array>} Array of booking objects that need reminders
 */
async function findBookingsNeedingReminders(currentTime = new Date()) {
  const db = await getDatabase();
  
  // Calculate 6 hours from now
  const sixHoursLater = new Date(currentTime.getTime() + 6 * 60 * 60 * 1000);
  const currentTimeStr = currentTime.toISOString().split('T')[0] + ' ' + 
                        currentTime.toTimeString().split(' ')[0];
  const sixHoursLaterStr = sixHoursLater.toISOString().split('T')[0] + ' ' + 
                          sixHoursLater.toTimeString().split(' ')[0];
  
  return new Promise((resolve, reject) => {
    // Find confirmed bookings where journey_date is within 6 hours
    db.all(
      `SELECT b.* FROM bookings b
       LEFT JOIN message_logs ml ON b.id = ml.booking_id AND ml.type = 'reminder'
       WHERE b.status = 'confirmed'
         AND ml.id IS NULL
         AND datetime(b.journey_date || ' ' || (
           SELECT r.departure_time FROM routes r WHERE r.id = b.route_id
         )) BETWEEN datetime(?) AND datetime(?)
       ORDER BY b.journey_date ASC`,
      [currentTimeStr, sixHoursLaterStr],
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
  findByPhone,
  updateStatus,
  hasReminder,
  findBookingsNeedingReminders
};
