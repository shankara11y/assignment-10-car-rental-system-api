const { supabase } = require('../config/supabase');

/**
 * Calculate the number of rental days between start_date and end_date.
 * E.g., 2026-05-01 to 2026-05-05 is 4 days (or 1 day if same-day rental).
 */
const calculateRentalDays = (startDateStr, endDateStr) => {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);

  const timeDiff = end.getTime() - start.getTime();
  const diffDays = Math.ceil(timeDiff / (1000 * 3600 * 24));

  return diffDays <= 0 ? 1 : diffDays;
};

/**
 * Book a vehicle (Checks date collisions & computes total cost)
 * POST /api/rentals
 */
const createRental = async (req, res, next) => {
  try {
    const { vehicle_id, start_date, end_date, customer_name, customer_email } = req.body;
    const user_id = req.user.id;

    // Validate required fields
    if (!vehicle_id || !start_date || !end_date || !customer_name || !customer_email) {
      return res.status(400).json({
        success: false,
        message: 'vehicle_id, start_date, end_date, customer_name, and customer_email are required',
      });
    }

    // Validate dates
    const start = new Date(start_date);
    const end = new Date(end_date);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid start_date or end_date format. Use YYYY-MM-DD format.',
      });
    }

    if (end < start) {
      return res.status(400).json({
        success: false,
        message: 'end_date cannot be earlier than start_date',
      });
    }

    // Check if vehicle exists
    const { data: vehicle, error: vehicleErr } = await supabase
      .from('vehicles')
      .select('*')
      .eq('id', vehicle_id)
      .single();

    if (vehicleErr || !vehicle) {
      return res.status(404).json({
        success: false,
        message: `Vehicle with ID ${vehicle_id} not found`,
      });
    }

    // Check vehicle status
    if (vehicle.status === 'maintenance') {
      return res.status(400).json({
        success: false,
        message: 'Vehicle is currently under maintenance and cannot be rented',
      });
    }

    // Date collision check for active/booked rentals
    // Two ranges [A_start, A_end] and [B_start, B_end] overlap if A_start <= B_end AND A_end >= B_start
    const { data: overlappingRentals, error: collisionErr } = await supabase
      .from('rentals')
      .select('id, start_date, end_date, status')
      .eq('vehicle_id', vehicle_id)
      .in('status', ['booked', 'active'])
      .lte('start_date', end_date)
      .gte('end_date', start_date);

    if (collisionErr) {
      return res.status(400).json({
        success: false,
        message: 'Error checking date availability',
        error: collisionErr.message,
      });
    }

    if (overlappingRentals && overlappingRentals.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Vehicle already reserved during this timeframe',
        conflicts: overlappingRentals,
      });
    }

    // Compute rental duration and total cost
    const rentalDays = calculateRentalDays(start_date, end_date);
    const dailyRate = parseFloat(vehicle.daily_rate);
    const total_cost = (rentalDays * dailyRate).toFixed(2);

    // Insert rental record
    const { data: rental, error: insertErr } = await supabase
      .from('rentals')
      .insert([
        {
          user_id,
          vehicle_id,
          customer_name,
          customer_email,
          start_date,
          end_date,
          total_cost,
          status: 'booked',
        },
      ])
      .select('*, vehicles(*)')
      .single();

    if (insertErr) {
      return res.status(400).json({
        success: false,
        message: 'Failed to create rental booking',
        error: insertErr.message,
      });
    }

    // Update vehicle status to rented if rental starts today or active
    const todayStr = new Date().toISOString().split('T')[0];
    if (start_date <= todayStr && end_date >= todayStr) {
      await supabase.from('vehicles').update({ status: 'rented' }).eq('id', vehicle_id);
    }

    return res.status(201).json({
      success: true,
      message: 'Rental booked successfully',
      summary: {
        rental_days: rentalDays,
        daily_rate: dailyRate,
        total_cost: parseFloat(total_cost),
      },
      data: rental,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * List rentals for authenticated user
 * GET /api/rentals/my-bookings
 */
const getMyBookings = async (req, res, next) => {
  try {
    const user_id = req.user.id;

    const { data: bookings, error } = await supabase
      .from('rentals')
      .select('*, vehicles(*)')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Failed to fetch bookings',
        error: error.message,
      });
    }

    return res.status(200).json({
      success: true,
      count: bookings.length,
      data: bookings,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Cancel upcoming rental
 * PATCH /api/rentals/:id/cancel
 */
const cancelRental = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user_id = req.user.id;

    // Fetch rental
    const { data: rental, error: fetchErr } = await supabase
      .from('rentals')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !rental) {
      return res.status(404).json({
        success: false,
        message: `Rental booking with ID ${id} not found`,
      });
    }

    // Ensure user owns rental (or admin)
    if (rental.user_id !== user_id) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You can only cancel your own bookings',
      });
    }

    if (rental.status === 'completed' || rental.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: `Cannot Cancel: Rental is already ${rental.status}`,
      });
    }

    // Update rental status to cancelled
    const { data: updatedRental, error: updateErr } = await supabase
      .from('rentals')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .select('*, vehicles(*)')
      .single();

    if (updateErr) {
      return res.status(400).json({
        success: false,
        message: 'Failed to cancel rental',
        error: updateErr.message,
      });
    }

    // Check if vehicle has any other active/booked rentals, if not set status back to available
    const { data: remainingActive } = await supabase
      .from('rentals')
      .select('id')
      .eq('vehicle_id', rental.vehicle_id)
      .in('status', ['booked', 'active']);

    if (!remainingActive || remainingActive.length === 0) {
      await supabase.from('vehicles').update({ status: 'available' }).eq('id', rental.vehicle_id);
    }

    return res.status(200).json({
      success: true,
      message: 'Rental booking cancelled successfully',
      data: updatedRental,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Mark car as returned (Sets vehicle status back to available)
 * PATCH /api/rentals/:id/complete
 */
const completeRental = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Fetch rental
    const { data: rental, error: fetchErr } = await supabase
      .from('rentals')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !rental) {
      return res.status(404).json({
        success: false,
        message: `Rental booking with ID ${id} not found`,
      });
    }

    if (rental.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Rental is already marked as completed',
      });
    }

    if (rental.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Cannot complete a cancelled rental',
      });
    }

    // Mark rental as completed
    const { data: updatedRental, error: updateErr } = await supabase
      .from('rentals')
      .update({ status: 'completed' })
      .eq('id', id)
      .select('*, vehicles(*)')
      .single();

    if (updateErr) {
      return res.status(400).json({
        success: false,
        message: 'Failed to complete rental',
        error: updateErr.message,
      });
    }

    // Set vehicle status back to available
    await supabase.from('vehicles').update({ status: 'available' }).eq('id', rental.vehicle_id);

    return res.status(200).json({
      success: true,
      message: 'Rental marked as completed and vehicle status set to available',
      data: updatedRental,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createRental,
  getMyBookings,
  cancelRental,
  completeRental,
};
