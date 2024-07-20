const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const itemSchema = new Schema({
  OBALUN: { type: String },
  OBDIA2: { type: String },
  OBITNO: { type: String },
  OBORQA: { type: Number },
  OBPIDE: { type: String },
  OBPONR: { type: String },
  OBSAPR: { type: Number },
  OBSPUN: { type: String },
  itemamount: { type: Number },
  disamount: { type: Number },
  itemname: { type: String },
  unit: { type: String },
  qtytext: { type: String },
  itemNo: { type: Number }
});

const customerSchema = new Schema({
  companycode: { type: Number },
  status: { type: String },
  customertype: { type: String },
  customercode: { type: String },
  customername: { type: String },
  addressid: { type: String },
  address1: { type: String },
  address2: { type: String },
  address3: { type: String },
  postcode: { type: String },
  phone: { type: String },
  salecode: { type: String },
  ordertype: { type: String },
  warehouse: { type: String },
  zone: { type: String },
  area: { type: String },
  team: { type: String },
  duocode: { type: String },
  route: { type: String },
  payer: { type: String },
  taxno: { type: String }
});

const receiptSchema = new Schema({
  CUNO: { type: String },
  CUOR: { type: String },
  FACT: { type: String },
  OAODAM: { type: Number },
  OAORDT: { type: String },
  OAORTP: { type: String },
  RLDT: { type: String },
  WHLO: { type: String },
  OBSMCD: { type: String },
  total: { type: Number },
  totaltext: { type: Number },
  totaldis: { type: Number },
  ex_vat: { type: Number },
  vat: { type: Number },
  customer: customerSchema,
  items: [itemSchema],
  area: { type: String }
});

const Receipt = mongoose.model('Receipt', receiptSchema);

module.exports = Receipt;