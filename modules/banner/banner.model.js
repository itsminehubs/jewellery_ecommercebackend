const mongoose = require('mongoose');
const { BANNER_TYPES, BANNER_STATUS } = require('../../utils/constants');

const bannerSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  image: { url: { type: String, required: true }, public_id: String },
  type: { type: String, enum: Object.values(BANNER_TYPES), required: true },
  link: { type: String, trim: true },
  status: { type: String, enum: Object.values(BANNER_STATUS), default: BANNER_STATUS.ACTIVE },
  startDate: { type: Date },
  endDate: { type: Date },
  order: { type: Number, default: 0 },
  clicks: { type: Number, default: 0 }
}, { timestamps: true });

bannerSchema.index({ type: 1, status: 1, order: 1 });

module.exports = mongoose.model('Banner', bannerSchema);