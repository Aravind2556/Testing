const express = require('express');
const User = require('../models/User');
const Candidate = require('../models/Candidate');
const Job = require('../models/Job');
const isAdmin = require('../middleware/isAdmin');
const mongoose = require('mongoose')
const router = express.Router();

router.get('/admin/metrics', isAdmin, async (req, res) => {
  try {
    const [userCount, candidateCount, jobCount] = await Promise.all([
      User.countDocuments({}),
      Candidate.countDocuments({}),
      Job.countDocuments({})
    ]);

    return res.json({
      success: true,
      metrics: {
        userManagement:      userCount,
        candidateManagement: candidateCount,
        jobManagement:       jobCount,
        account:             1 // always show “1” for My Account
      }
    });
  } catch (err) {
    console.error('Error in admin/metrics:', err);
    return res.status(500).json({
      success: false,
      message: 'Unable to fetch admin metrics.'
    });
  }
});

router.get('/admin/users', async (req, res) => {
  try {

    if (req.session.user.role !== 'admin') {
      return res.status(403).json({ success:false, message:'Forbidden' });
    }

    let { page = '1', perPage = '10', search = '', sortField = 'firstName', sortOrder = 'asc', role } = req.query;
    const p = Math.max(1, parseInt(page, 10));
    const pp = Math.max(1, parseInt(perPage, 10));

    // Build filter
    const filter = {};
    if (search.trim()) {
      const re = new RegExp(search.trim(), 'i');
      filter.$or = [
        { firstName: re },
        { lastName: re },
        { email: re },
        { id: re }
      ];
    }
    if (role) {
      filter.role = role;
    }

    // Count & paginate
    const totalCount = await User.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / pp) || 1;

    // Sorting
    const sort = {};
    sort[sortField] = sortOrder === 'asc' ? 1 : -1;

    const users = await User.find(filter)
      .sort(sort)
      .skip((p - 1) * pp)
      .limit(pp)
      .select('id firstName lastName email contact role')
      .lean();

    res.json({
      success: true,
      users,
      pagination: { page: p, perPage: pp, totalPages, totalCount }
    });
  } catch (err) {
    console.error('Error listing users:', err);
    res.status(500).json({ success: false, message: 'Unable to list users.' });
  }
});

router.get('/admin/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID.' });
    }
    const user = await User.findById(id).lean();
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    res.json({ success: true, user });
  } catch (err) {
    console.error('Error fetching user:', err);
    res.status(500).json({ success: false, message: 'Unable to fetch user.' });
  }
});

router.delete('/admin/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID.' });
    }
    const deleted = await User.findByIdAndDelete(id).lean();
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    res.json({ success: true, message: 'User deleted.' });
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({ success: false, message: 'Unable to delete user.' });
  }
});

module.exports = router;
