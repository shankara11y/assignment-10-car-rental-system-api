const express = require('express');
const router = express.Router();
const rentalController = require('../controllers/rentalController');
const authMiddleware = require('../middleware/auth');

// All rental operations require Auth
router.post('/', authMiddleware, rentalController.createRental);
router.get('/my-bookings', authMiddleware, rentalController.getMyBookings);
router.patch('/:id/cancel', authMiddleware, rentalController.cancelRental);
router.patch('/:id/complete', authMiddleware, rentalController.completeRental);

module.exports = router;
