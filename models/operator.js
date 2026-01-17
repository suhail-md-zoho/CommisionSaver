const { getDatabase } = require('../database');

/**
 * Find operator by phone number
 * @param {string} phoneNumber - Phone number to search for
 * @returns {Promise<Object|null>} Operator object or null if not found
 */
async function findByPhone(phoneNumber) {
  const db = await getDatabase();
  
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM operators WHERE phone_number = ?',
      [phoneNumber],
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

module.exports = {
  findByPhone
};
