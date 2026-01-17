const bookingModel = require('../models/booking');
const routeModel = require('../models/route');
const messageLogModel = require('../models/messageLog');
const whatsappService = require('./whatsapp');

/**
 * Send reminders for bookings within the next 6 hours.
 * Uses message_logs to prevent duplicate reminders.
 */
async function sendReminders() {
  const bookings = await bookingModel.findBookingsNeedingReminders(new Date());

  if (!bookings.length) {
    return;
  }

  for (const booking of bookings) {
    try {
      const route = await routeModel.findById(booking.route_id);

      if (!route) {
        console.error(`Route not found for booking ${booking.id}`);
        continue;
      }

      const reminderMessage = `Reminder: Your bus from ${route.source} to ${route.destination} ` +
        `departs at ${route.departure_time} on ${booking.journey_date}. Safe journey!`;

      await whatsappService.sendMessage(booking.customer_phone, reminderMessage);

      await messageLogModel.create({
        booking_id: booking.id,
        type: 'reminder'
      });

      console.log(`Reminder sent for booking ${booking.id}`);
    } catch (error) {
      console.error(`Failed to send reminder for booking ${booking.id}:`, error.message);
    }
  }
}

module.exports = {
  sendReminders
};
