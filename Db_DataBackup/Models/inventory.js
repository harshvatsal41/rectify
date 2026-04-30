const mongoose = require("mongoose");
const { Schema, Types } = mongoose;
const {Warehouse} = require("./warehouse")


const movementHistorySchema = new Schema({
  date: { type: Date, default: Date.now },
  type: {
    type: String,
    enum: [
      'receipt', 'sale', 'adjustment', 'transfer', 'zone_transfer',
      'return', 'quarantine', 'release', 'damage', 'expire'
    ],
  },
  quantityChange: { type: Number },
  referenceId: String,
  userId: { type: Types.ObjectId, ref: "User" },
  notes: String,
  fromLocation: {
    warehouseId: Types.ObjectId,
    zoneId: Types.ObjectId,
    rackId: Types.ObjectId,
    binId: Types.ObjectId,
    locationPath: String
  },
  toLocation: {
    warehouseId: Types.ObjectId,
    zoneId: Types.ObjectId,
    rackId: Types.ObjectId,
    binId: Types.ObjectId,
    locationPath: String
  },
  approvalRequired: { type: Boolean, default: false },
  approvedBy: { type: Types.ObjectId, ref: "User" },
  approvedAt: Date,
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'completed'],
    default: 'completed'
  },
  rejectionReason: String
});

const stockLocationSchema = new Schema({
  warehouseId: {
    type: Types.ObjectId,
    ref: "Warehouse",
    required: true,
    index: true
  },
  zoneId: {
    type: Types.ObjectId,
    required: true,
    index: true
  },
  rackId: {
    type: Types.ObjectId,
    required: true,
    index: true
  },
  binId: {
    type: Types.ObjectId,
    required: true,
    index: true
  },
  locationCodePath: String,
  quantity: {
    type: Number,
    min: 0,
    required: true,
    validate: {
      validator: Number.isInteger,
      message: '{VALUE} is not an integer value'
    }
  },
  freeQuantity:{
    type:Number,
    default:0
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'quarantined', 'disposed'],
    default: 'active'
  },
  lastMovedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  batchId: {
    type: Types.ObjectId,
    ref: "Batch",
    index: true
  },
  batchNumber: {
    type: String,
  },
  expiryDate: Date,
  lastCounted: Date
});

const inventorySchema = new Schema({

  srNo: {
    type: Number,
    index: true
  },

  product: {
    type: Types.ObjectId,
    ref: "Product",
    required: true,
    index: true
  },
  expiryDate: Date,

  vendor: {
    type: Types.ObjectId,
    ref: "Vendor",
    index: true
  },

  sku: {
    type: String,
    index: true
  },
  // Total quantity across all locations (virtual/computed field)
  totalQuantity: {
    type: Number,
  },

  quantity: {
    type: Number,
  },

  freeQuantity: {
    type: Number,
  },

  rawPrice:Number, // price exclusive of discount and inclusive of free quantity
  saleRate:Number,
  schemeSaleRate:Number,

  // Array of locations where this product is stored
  locations: [stockLocationSchema],
  movementHistory: [movementHistorySchema],

  grnReference: { type: Types.ObjectId, ref: "GRN" },
  poReference: { type: Types.ObjectId, ref: "PurchaseOrder" },

  batchNumber: {
    type: String,
    index: true
  },

  batchId: {
    type: Types.ObjectId,
    ref: "Batch",
  },

  updateCount: {
    type: Number,
    default: 0
  },

  lastQuantityChange: {
    type: Number,
    default: 0
  },

  reorderSettings: {
    reorderPoint: {
      type: Number,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: '{VALUE} is not an integer value'
      }
    },
    reorderQuantity: {
      type: Number,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: '{VALUE} is not an integer value'
      }
    },
    maxStock: {
      type: Number,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: '{VALUE} is not an integer value'
      }
    }
  },

  createdBy: { type: Types.ObjectId, ref: 'User' },
  isDeleted: { type: Boolean, default: false },
  deletedAt: Date,
  deletedBy: { type: Types.ObjectId, ref: 'User' }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient querying
inventorySchema.index({
  product: 1,
  'locations.batchId': 1
});

inventorySchema.index({
  'locations.warehouseId': 1,
  'locations.zoneId': 1,
  'locations.rackId': 1,
  'locations.binId': 1,
  'locations.status': 1
});

// Virtual for total quantity calculation
// inventorySchema.virtual('calculatedTotal').get(function () {
//   return this.locations.reduce((total, loc) => total + loc.quantity, 0);
// });

// Pre-save hook to validate locations and update totalQuantity
inventorySchema.pre('save', async function (next) {
  // Calculate and update total quantity
  this.totalQuantity = this.locations.reduce((total, loc) => total + loc.quantity, 0);

  // Validate each location
  for (const location of this.locations) {

    if (location.quantity < 0) {
      throw new Error(`Quantity cannot be negative for location ${location.locationCodePath}`);
    }

    // Validate location references
    // const warehouse = await mongoose.model('Warehouse').findOne({
    //   _id: location.warehouseId,
    //   'zones._id': location.zoneId,
    //   'zones.racks._id': location.rackId,
    //   'zones.racks.bins._id': location.binId
    // });

    // if (!warehouse) {
    //   throw new Error('Invalid product location reference');
    // }

    // Update location path if needed
    // const zone = warehouse.zones.id(location.zoneId);
    // const rack = zone.racks.id(location.rackId);
    // const bin = rack.bins.id(location.binId);
    // location.locationCodePath = `${warehouse.code}/${zone.code}/${rack.code}/${bin.code}`;


  }

  next();
});

// Post-save hook to update warehouse bin statuses
inventorySchema.post('save', async function (doc) {
  const warehouseModel = mongoose.model('Warehouse');

  // Track which bins we've updated to avoid duplicate updates
  const updatedBins = new Set();

  for (const location of doc.locations) {
    const binKey = `${location.warehouseId}-${location.zoneId}-${location.rackId}-${location.binId}`;

    if (!updatedBins.has(binKey)) {
      updatedBins.add(binKey);

      const warehouse = await warehouseModel.findOne({
        _id: location.warehouseId,
        'zones._id': location.zoneId,
        'zones.racks._id': location.rackId,
        'zones.racks.bins._id': location.binId
      });

      if (warehouse) {
        const zone = warehouse.zones.id(location.zoneId);
        const rack = zone.racks.id(location.rackId);
        const bin = rack.bins.id(location.binId);

        // Count items in this bin (excluding damaged/returned)
        const itemsInLocation = await mongoose.model('Inventory').countDocuments({
          'locations': {
            $elemMatch: {
              warehouseId: location.warehouseId,
              zoneId: location.zoneId,
              rackId: location.rackId,
              binId: location.binId,
              status: { $nin: ['damaged', 'returned'] }
            }
          }
        });

        // bin.status = itemsInLocation > 0 ? 'occupied' : 'available';
        await warehouse.save();
        await warehouse.updateUtilization();
      }
    }
  }
});

const Inventory =  mongoose.models.Inventory || mongoose.model("Inventory", inventorySchema);

module.exports = {Inventory}