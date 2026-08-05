const mongoose = require('mongoose');

const diamondRateSchema = new mongoose.Schema({
  cut: {
    type: String,
    enum: ['Round', 'Pear', 'Marquis', 'Oval', 'Emerald', 'Cushion', 'Heart', 'All'],
    default: 'All'
  },
  color: {
    type: String,
    default: 'All' // e.g., 'D-F', 'G-J', 'K-M'
  },
  clarity: {
    type: String,
    default: 'All' // e.g., 'FL-IF', 'VVS1-VVS2', 'VS1-VS2', 'SI1-SI2'
  },
  ratePerCarat: {
    type: Number,
    required: true,
    min: 0
  },
  effectiveDate: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

// Index to quickly fetch the latest rate
diamondRateSchema.index({ cut: 1, color: 1, clarity: 1, effectiveDate: -1 });
diamondRateSchema.index({ createdAt: -1 });

module.exports = mongoose.model('DiamondRate', diamondRateSchema);
