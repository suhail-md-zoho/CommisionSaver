const express = require('express');
const cron = require('node-cron');
const dotenv = require('dotenv');

const { initializeDatabase } = require('./database');
const webhookRoutes = require('./routes/webhook');
const bookingRoutes = require('./routes/booking');
const { sendReminders } = require('./services/reminder');

dotenv.config();

const app = express();

app.use(express.json());

app.use('/', webhookRoutes);
app.use('/booking', bookingRoutes);

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await initializeDatabase();

    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    cron.schedule('*/30 * * * *', async () => {
      try {
        await sendReminders();
      } catch (error) {
        console.error('Reminder job failed:', error.message);
      }
    });

    process.on('SIGINT', () => {
      console.log('Shutting down...');
      server.close(() => {
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();
