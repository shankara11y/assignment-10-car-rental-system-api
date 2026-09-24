const { supabase } = require('../config/supabase');

const VALID_CATEGORIES = ['Sedan', 'SUV', 'Luxury', 'Hatchback', 'Electric'];
const VALID_STATUSES = ['available', 'rented', 'maintenance'];

/**
 * Fetch all vehicles with optional filters (?category=SUV&status=available)
 * GET /api/vehicles
 */
const getAllVehicles = async (req, res, next) => {
  try {
    const { category, status } = req.query;

    let query = supabase.from('vehicles').select('*').order('created_at', { ascending: false });

    if (category) {
      query = query.eq('category', category);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data: vehicles, error } = await query;

    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Failed to fetch vehicles',
        error: error.message,
      });
    }

    return res.status(200).json({
      success: true,
      count: vehicles.length,
      data: vehicles,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get single vehicle details with its past/associated rental records
 * GET /api/vehicles/:id
 */
const getVehicleById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Relational join using Supabase syntax: select vehicle and nested rentals
    const { data: vehicle, error } = await supabase
      .from('vehicles')
      .select('*, rentals(*)')
      .eq('id', id)
      .single();

    if (error || !vehicle) {
      return res.status(404).json({
        success: false,
        message: `Vehicle with ID ${id} not found`,
      });
    }

    return res.status(200).json({
      success: true,
      data: vehicle,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Add a new vehicle to fleet
 * POST /api/vehicles
 */
const createVehicle = async (req, res, next) => {
  try {
    const { brand, model, year, category, daily_rate, fuel_type, seating_capacity, status } = req.body;

    if (!brand || !model || !year || !category || !daily_rate || !fuel_type) {
      return res.status(400).json({
        success: false,
        message: 'brand, model, year, category, daily_rate, and fuel_type are required fields',
      });
    }

    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
      });
    }

    const numericRate = parseFloat(daily_rate);
    if (isNaN(numericRate) || numericRate <= 0) {
      return res.status(400).json({
        success: false,
        message: 'daily_rate must be a positive number',
      });
    }

    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
      });
    }

    const { data, error } = await supabase
      .from('vehicles')
      .insert([
        {
          brand,
          model,
          year: parseInt(year, 10),
          category,
          daily_rate: numericRate,
          fuel_type,
          seating_capacity: seating_capacity ? parseInt(seating_capacity, 10) : 5,
          status: status || 'available',
        },
      ])
      .select()
      .single();

    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Failed to create vehicle',
        error: error.message,
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Vehicle added to fleet successfully',
      data,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Update vehicle daily rate or status
 * PUT /api/vehicles/:id
 */
const updateVehicle = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { daily_rate, status, brand, model, year, category, fuel_type, seating_capacity } = req.body;

    // Check if vehicle exists
    const { data: existing, error: findErr } = await supabase
      .from('vehicles')
      .select('id')
      .eq('id', id)
      .single();

    if (findErr || !existing) {
      return res.status(404).json({
        success: false,
        message: `Vehicle with ID ${id} not found`,
      });
    }

    const updatePayload = {};

    if (category !== undefined) {
      if (!VALID_CATEGORIES.includes(category)) {
        return res.status(400).json({
          success: false,
          message: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
        });
      }
      updatePayload.category = category;
    }

    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
        });
      }
      updatePayload.status = status;
    }

    if (daily_rate !== undefined) {
      const numericRate = parseFloat(daily_rate);
      if (isNaN(numericRate) || numericRate <= 0) {
        return res.status(400).json({
          success: false,
          message: 'daily_rate must be a positive number',
        });
      }
      updatePayload.daily_rate = numericRate;
    }

    if (brand !== undefined) updatePayload.brand = brand;
    if (model !== undefined) updatePayload.model = model;
    if (year !== undefined) updatePayload.year = parseInt(year, 10);
    if (fuel_type !== undefined) updatePayload.fuel_type = fuel_type;
    if (seating_capacity !== undefined) updatePayload.seating_capacity = parseInt(seating_capacity, 10);

    const { data, error } = await supabase
      .from('vehicles')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Failed to update vehicle',
        error: error.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Vehicle updated successfully',
      data,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Delete vehicle from fleet
 * DELETE /api/vehicles/:id
 */
const deleteVehicle = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if vehicle exists
    const { data: vehicle, error: findErr } = await supabase
      .from('vehicles')
      .select('id')
      .eq('id', id)
      .single();

    if (findErr || !vehicle) {
      return res.status(404).json({
        success: false,
        message: `Vehicle with ID ${id} not found`,
      });
    }

    // Check if there are active or booked rentals for this vehicle
    const { data: activeRentals, error: rentalErr } = await supabase
      .from('rentals')
      .select('id, status')
      .eq('vehicle_id', id)
      .in('status', ['booked', 'active']);

    if (rentalErr) {
      return res.status(400).json({
        success: false,
        message: 'Error checking vehicle booking constraints',
        error: rentalErr.message,
      });
    }

    if (activeRentals && activeRentals.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Has Active Bookings: Cannot delete vehicle with active or upcoming reservations',
      });
    }

    // Attempt deletion (foreign key ON DELETE RESTRICT will also enforce if any rental history exists)
    const { error: deleteErr } = await supabase
      .from('vehicles')
      .delete()
      .eq('id', id);

    if (deleteErr) {
      return res.status(400).json({
        success: false,
        message: 'Has Active Bookings / Rental History: Deletion restricted by database constraints',
        error: deleteErr.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: `Vehicle ID ${id} deleted successfully from fleet`,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAllVehicles,
  getVehicleById,
  createVehicle,
  updateVehicle,
  deleteVehicle,
};
