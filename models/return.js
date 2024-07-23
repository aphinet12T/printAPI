const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const itemSchema = new Schema({
  CUOR: { type: String },
  OBITNO: { type: String },
  OBALUN: { type: String },
  OBORQA: { type: Number },
  OBSAPR: { type: Number },
  OBSPUN: { type: String },
  OBWHSL: { type: String },
  OBPONR: { type: Number },
  OBDIA2: { type: Number },
  OBSMCD: { type: String },
  OAORTP: { type: String }
});

const returnItemSchema = new Schema({
  CUOR: { type: String },
  OBITNO: { type: String },
  OBALUN: { type: String },
  OBORQA: { type: Number },
  OBSAPR: { type: Number },
  OBSPUN: { type: String },
  OBWHSL: { type: String },
  OBPONR: { type: Number },
  OBDIA2: { type: Number },
  OBSMCD: { type: String },
  OAORTP: { type: String }
});

const returnSchema = new Schema({
  CUNO: { type: String },
  FACI: { type: String },
  WHLO: { type: String },
  RLDT: { type: String },
  OAOREF: { type: String },
  saleItems: [itemSchema],
  returnItems: [returnItemSchema],
  OAORDT: { type: String }
});

const Return = mongoose.model('Return', returnSchema);

module.exports = Return;