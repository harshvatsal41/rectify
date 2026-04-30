const mongoose = require("mongoose");
const {Schema ,Types} = mongoose;
const XLSX = require("xlsx");
const fs = require("fs");
const connectDB = require("./Db_DataBackup/Connect");



const binSchema = new Schema({
    name: { type: String },
    code: { type: String },
    type: String,
    status: {
        type: String,
        enum: ['available', 'occupied', 'maintenance'],
        default: 'available'
    },
    dimensions: {
        width: Number,
        depth: Number,
        height: Number,
        unit: { type: String, enum: ['cm', 'm', 'in', 'ft'], default: 'cm' }
    },
    temperatureRange: {
        min: Number,
        max: Number,
        unit: { type: String, enum: ['C', 'F'], default: 'C' }
    },
    currentUtilization: { type: Number },
    capacity: Number,
    lastAudit: Date,

    position: {
        column: Number,
        row: Number,
        depth: Number
    },

    // references 

    warehouse: { type: Types.ObjectId, ref: 'Warehouse' },
    zone: { type: Types.ObjectId, ref: 'Zone' },
    rack: { type: Types.ObjectId, ref: 'Rack' }


});



const rackSchema = new Schema({
    name: { type: String },
    code: { type: String },
    type: String,
    status: {
        type: String,
        enum: ['available', 'occupied', 'maintenance'],
        default: 'available'
    },
    dimensions: {
        width: Number,
        depth: Number,
        height: Number,
        unit: { type: String, enum: ['cm', 'm', 'in', 'ft'], default: 'cm' }
    },
    bins: [binSchema],
    levels: Number,
    binsPerLevel: Number,
    totalBins: Number,
    capacity: Number,
    currentUtilization: Number,
    temperatureRange: {
        min: Number,
        max: Number,
        unit: { type: String, enum: ['C', 'F'], default: 'C' }
    },
    lastAudit: Date,

    warehouse: { type: Types.ObjectId, ref: 'Warehouse' },
    zone: { type: Types.ObjectId, ref: 'Zone' }
});



const zoneSchema = new Schema({
    name: { type: String },
    code: { type: String },
    type: {
        type: String,
        enum: [
            'receiving',
            'quarantine',
            'staged',
            'storage', // new
            'privacy_storage',
            'dropbox',
            'cold_storage',
            'hazardous',
            'pharmacy',
            'medical_supplies',
            'general',
            'disposal', // new
            'outbound' // new
        ],
        required: true
    },
    racks: [rackSchema],
    capacity: Number,
    currentUtilization: Number,
    status: {
        type: String,
        enum: ['active', 'inactive', 'full'],
        default: 'active'
    },
    // manager: { type: Types.ObjectId, ref: 'Staff' },
    specialRequirements: String,
    temperatureRange: {
        min: Number,
        max: Number,
        unit: { type: String, enum: ['C', 'F'], default: 'C' }
    },
    lastAudit: Date,

    // references 

    warehouse: { type: Types.ObjectId, ref: 'Warehouse' }
});

///######################Warehouse Schema######################
const warehouseSchema = new Schema({
    name: { type: String, required: true },
    description: String,
    code: { type: String },

    location: {
        address: { type: String, required: true },
        city: String,
        state: String,
        country: String,
        pincode: String,
        building: String,
        floor: Number,
        roomNumber: String,
        gpsCoordinates: String,
        hospitalZone: String
    },

    contact: {
        contactPerson: String,
        contactNumber: String,
        secondaryContactNumber: String,
        email: String,
        emergencyContact: String
    },

    assignedManager: { type: Types.ObjectId, ref: 'User' },

    dimensions: {
        totalArea: Number,
        usableCapacity: Number,
        height: Number,
        layoutType: {
            type: String,
            enum: ['racking', 'bulk_storage', 'shelving', 'mixed'],
            default: 'racking'
        },
        temperatureZone: {
            type: String,
            enum: ['ambient', 'refrigerated', 'frozen', 'controlled'],
            default: 'ambient'
        }
    },

    status: {
        type: String,
        enum: ['active', 'inactive', 'under_maintenance'],
        default: 'active'
    },

    zones: [zoneSchema],

    isCentralWarehouse: { type: Boolean, default: false },
    lastInventoryDate: Date,
    nextScheduledAudit: Date,

    security: {
        accessLevelRequired: {
            type: String,
            enum: ['unrestricted', 'restricted', 'high_security'],
            default: 'restricted'
        },
        hasCCTV: { type: Boolean, default: false },
        hasAlarm: { type: Boolean, default: false },
        accessControlSystem: String
    },

    createdBy: { type: Types.ObjectId, ref: 'User' },
    updatedBy: { type: Types.ObjectId, ref: 'User' }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});


warehouseSchema.pre('save', function () {
    if (this.zones && this.zones.length > 0) {
        const zoneCodes = new Set();

        for (const zone of this.zones) {
            // Check unique zone codes
            if (zoneCodes.has(zone.code)) {
                throw new Error(`Duplicate zone code: ${zone.code}`);
            }
            zoneCodes.add(zone.code);

            // Check unique rack codes within zone
            if (zone.racks && zone.racks.length > 0) {
                const rackCodes = new Set();
                for (const rack of zone.racks) {
                    if (rackCodes.has(rack.code)) {
                        throw new Error(`Duplicate rack code: ${rack.code} in zone ${zone.code}`);
                    }
                    rackCodes.add(rack.code);

                    // Check unique bin codes within rack
                    if (rack.bins && rack.bins.length > 0) {
                        const binCodes = new Set();
                        for (const bin of rack.bins) {
                            if (binCodes.has(bin.code)) {
                                throw new Error(`Duplicate bin code: ${bin.code} in rack ${rack.code}`);
                            }
                            binCodes.add(bin.code);
                        }
                    }
                }
            }
        }
    }
});

// Update utilization when storage locations change
warehouseSchema.methods.updateUtilization = async function () {
    let totalCapacity = 0;
    let totalUtilized = 0;

    for (const zone of this.zones) {
        let zoneUtilization = 0;
        let zoneCapacity = 0;

        for (const rack of zone.racks) {
            let rackUtilization = 0;
            let rackCapacity = rack.bins ? rack.bins.length : 0;

            if (rack.bins) {
                for (const bin of rack.bins) {
                    if (bin.status === 'occupied') {
                        rackUtilization++;
                    }
                }
            }

            rack.currentUtilization = rackUtilization;
            zoneUtilization += rackUtilization;
            zoneCapacity += rackCapacity;
        }

        zone.currentUtilization = zoneUtilization;
        zone.capacity = zoneCapacity;

        // Update zone status
        if (zoneCapacity > 0 && zoneUtilization >= zoneCapacity) {
            zone.status = 'full';
        } else {
            zone.status = 'active';
        }

        totalUtilized += zoneUtilization;
        totalCapacity += zoneCapacity;
    }

    this.dimensions.currentUtilization = totalUtilized;
    this.dimensions.usableCapacity = totalCapacity;
    await this.save();
};

const Bin = mongoose.models.Bin || mongoose.model("Bin", binSchema);
const Rack = mongoose.models.Rack || mongoose.model("Rack", rackSchema);
const Zone = mongoose.models.Zone || mongoose.model("Zone", zoneSchema);
const Warehouse = mongoose.models.Warehouse || mongoose.model("Warehouse", warehouseSchema);

module.exports = { Bin, Rack, Zone, Warehouse };

// Import models from your existing files

// MODELS
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
inventorySchema.pre('save', async function () {

  // Calculate and update total quantity
  this.totalQuantity = this.locations.reduce((total, loc) => total + loc.quantity, 0);

  for (const location of this.locations) {
    if (location.quantity < 0) {
      throw new Error(`Quantity cannot be negative for location ${location.locationCodePath}`);
    }
  }

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

const Inventory = mongoose.models.Inventory || mongoose.model("Inventory", inventorySchema);



const BatchSchema = new Schema({                                    
    batchNumber: {
        type: String,
        required: true,
        trim: true
    },

    product: {
        type: Schema.Types.ObjectId,
        ref: "Product",
        required: true
    },

    manufacturingDate: {
        type: Date,
        // required: true
    },

    gstPercentage:{
        type:Number,
    },

    expiryDate: {
        type: Date,
        required: true
    },

    supplier: {
        type: Schema.Types.ObjectId,
        ref: "Vendor",
    },

    shelfLife: {
        type: String, 
    },

    mrp:{
        type:Number,
        min:0
    },

    // product quantity 

    initialQuantity: {
        type: Number,
        required: true,
        min: 0
    },

    freeQuantity:{
        type:Number
    },

    availableQuantity: {
        type: Number,
        default: function() { return this.initialQuantity; }
    },

    storageLocation: {
        type: String,
        // enum: ["Pharmacy", "Central Store", "Ward A", "ICU"],
        // required: true
    },

    qcStatus: {
        type: String,
        enum: ["pending", "passed", "failed"],
        default: "pending"
    },

    qcDate: {
        type: Date,
        default: Date.now
    },

    qcNotes: {
        type: String
    },

    qcBy:{
        type:Schema.Types.ObjectId,
        ref:"User"
    },

    // metadata
    grnReference:{
        type:Schema.Types.ObjectId,
        ref:"GRN"
    },

    poReference:{
        type:Schema.Types.ObjectId,
        ref:"PurchaseOrder"
    },

    isActive:{
        type:Boolean,
        default:true
    },

    unitCost: Number,
    totalCost: Number,
    saleRate: Number,
    schemeSaleRate:Number,
    rawPrice: Number,// price exclusive of discount and inclusive of free quantity
    isDebited:{
        type:Boolean,
        default:false
    },
    createdBy:{
        type:Schema.Types.ObjectId,
        ref:"User"
    },

}, {
    timestamps: true,
    toJSON:{
        virtuals:true
    },
    toObject:{
        virtuals:true
    }
})

const Batch = mongoose.models.Batch || mongoose.model("Batch", BatchSchema);


// =====================================================
// CONFIGURATION
// =====================================================

// Fixed location (same for all inventory)
const LOCATION = {
  warehouseId: new mongoose.Types.ObjectId("68c3ee60362699b3a3158677"),
  zoneId: new mongoose.Types.ObjectId("68c3ee60362699b3a3158679"),
  rackId: new mongoose.Types.ObjectId("68c3ee61362699b3a3158681"),
  binId: new mongoose.Types.ObjectId("68c3ee61362699b3a3158682"),
  locationCodePath: "WH-MAIN-001/WH-MAIN-001-RECEIVING/RACK-RECEIVING-001/RACK-RECEIVING-001-BIN-001",
};

// =====================================================
// HELPER FUNCTIONS
// =====================================================
const normalize = (v) => String(v || "").trim();

const parseDate = (d) => {
  try {
    if (!d) return new Date("2030-01-01");

    if (typeof d === "number") {
      const date = new Date((d - 25569) * 86400 * 1000);
      return isNaN(date.getTime()) ? new Date("2030-01-01") : date;
    }

    if (typeof d === "string") {
      const cleaned = d.trim();
      if (!cleaned) return new Date("2030-01-01");

      // Handle "MM/YYYY" or "MM-YYYY" format
      if (cleaned.includes('/') || cleaned.includes('-')) {
        const parts = cleaned.split(/[/-]/);
        if (parts.length === 2) {
          const month = parseInt(parts[0]);
          const year = parseInt(parts[1]);
          if (!isNaN(month) && !isNaN(year) && month >= 1 && month <= 12) {
            return new Date(year < 100 ? 2000 + year : year, month - 1, 1);
          }
        }
      }

      const date = new Date(cleaned);
      if (!isNaN(date.getTime())) return date;
    }

    return new Date("2030-01-01");
  } catch (err) {
    return new Date("2030-01-01");
  }
};

const toFixedDecimal = (num, decimals = 2) => {
  if (isNaN(num)) return 0;
  return parseFloat(num.toFixed(decimals));
};

// =====================================================
// MAIN FUNCTION
// =====================================================
const main = async () => {
  try {
    await connectDB();
    console.log("✅ Connected to MongoDB");

    // Read Excel file
    const workbook = XLSX.readFile("l_inventory_audit.xlsx");
    const sheet = workbook.Sheets["MASTER_RECONCILED"];
    const rows = XLSX.utils.sheet_to_json(sheet);
    console.log(`📦 Total rows read: ${rows.length}`);

    // Get current max srNo for inventory
    const lastInventory = await Inventory.findOne().sort({ srNo: -1 });
    let currentSrNo = 9999;

    let successCount = 0;
    let failedCount = 0;
    const failedRows = [];

    // =====================================================
    // PROCESS EACH ROW - CREATE SEPARATE BATCH AND INVENTORY
    // =====================================================
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      
      try {
        // Extract required fields
        const batchNo = normalize(row["Batch/Barcode/M.R.P*"]);
        const productId = row["DB_id"];
        const vendorId = row["Vendor_id"];
        const mrp = Number(row["Mrp"]);
        const gstPercentage = Number(row["PUR_GST %"]);
        const expiryDate = parseDate(row["PUR_Expiry Date"]);
        
        // Calculate totals
        const purQty = Number(row["PUR_Qty"]);
        const purFreeQty = Number(row["PUR_Free Qty"]);
        const totalQuantity = purQty + purFreeQty;
        const purGoodsValue = Number(row["PUR_Goods Value"]);
        const remaining = Number(row["Remaining"]);

        // Validate required fields
        if (!batchNo) {
          throw new Error(`Missing batch number`);
        }

        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
          throw new Error(`Invalid product ID: ${productId}`);
        }

        if (!vendorId || !mongoose.Types.ObjectId.isValid(vendorId)) {
          throw new Error(`Invalid vendor ID: ${vendorId}`);
        }

        if (totalQuantity <= 0) {
          throw new Error(`Total quantity is zero or negative: ${totalQuantity}`);
        }

        // Calculate raw price (price per single unit)
        const rawPrice = purGoodsValue / totalQuantity;
        
        // Calculate sale rates (10% markup on raw price)
        const saleRate = toFixedDecimal(rawPrice * 1.1);
        const schemeSaleRate = toFixedDecimal(rawPrice * 1.1);
        
        // Calculate unit cost and total cost based on remaining quantity
        const unitCost = rawPrice;
        const totalCost = unitCost * remaining;

        // =====================================================
        // STEP 1: CREATE BATCH FOR THIS ROW (No duplicate check)
        // =====================================================
        const batchData = {
          batchNumber: batchNo,
          product: new mongoose.Types.ObjectId(productId),
          expiryDate: expiryDate,
          supplier: new mongoose.Types.ObjectId(vendorId),
          mrp: mrp,
          gstPercentage: gstPercentage,
          initialQuantity: remaining,
          freeQuantity: 0,
          availableQuantity: remaining,
          unitCost: unitCost,
          totalCost: totalCost,
          saleRate: saleRate,
          schemeSaleRate: schemeSaleRate,
          rawPrice: rawPrice,
          qcStatus: "passed",
          grnReference: null,
          poReference: null,
          isActive: true,
          isDebited: false,
          createdBy: null,
          manufacturingDate: null,
          shelfLife: null,
          storageLocation: "Main Store",
          qcDate: new Date(),
          qcBy: null,
          qcNotes: "Bulk upload from audit file"
        };

        console.log(batchData);
        const batch = await Batch.create(batchData);
        console.log(`✅ [${index + 1}] Batch created: ${batch.batchNumber} (ID: ${batch._id})`);

        // =====================================================
        // STEP 2: CREATE INVENTORY FOR THIS BATCH
        // =====================================================
        const inventoryData = {
          srNo: currentSrNo++,
          product: new mongoose.Types.ObjectId(productId),
          vendor: new mongoose.Types.ObjectId(vendorId),
          expiryDate: expiryDate,
          batchNumber: batchNo,
          batchId: batch._id,
          quantity: remaining,
          freeQuantity: 0,
          totalQuantity: remaining,
          rawPrice: rawPrice,
          saleRate: saleRate,
          schemeSaleRate: schemeSaleRate,
          grnReference: null,
          poReference: null,
          updateCount: 0,
          lastQuantityChange: remaining,
          locations: [{
            warehouseId: LOCATION.warehouseId,
            zoneId: LOCATION.zoneId,
            rackId: LOCATION.rackId,
            binId: LOCATION.binId,
            locationCodePath: LOCATION.locationCodePath,
            quantity: remaining,
            freeQuantity: 0,
            status: "active",
            batchId: batch._id,
            batchNumber: batchNo,
            expiryDate: expiryDate,
            lastCounted: new Date(),
            lastMovedAt: new Date(),
            createdAt: new Date()
          }],
          movementHistory: [{
            type: 'receipt',
            quantityChange: remaining,
            date: new Date(),
            notes: 'Initial bulk upload from audit file',
            status: 'completed',
            fromLocation: null,
            toLocation: LOCATION,
            approvalRequired: false,
            approvedAt: new Date()
          }]
        };

        await Inventory.create(inventoryData);
        console.log(`✅ [${index + 1}] Inventory created for batch: ${batchNo}`);

        successCount++;

      } catch (err) {
        console.log(`❌ [${index + 1}] Failed: ${err.message}`);
        failedCount++;
        failedRows.push({
          rowIndex: index + 1,
          batchNo: normalize(row["Batch/Barcode/M.R.P*"]),
          error: err.message
        });
      }
    }

    // =====================================================
    // CREATE AUDIT EXPORT
    // =====================================================
    console.log("\n📁 Creating audit file...");
    
    // Fetch all batches created in this session (last 100 for audit)
    const recentBatches = await Batch.find().sort({ createdAt: -1 }).limit(rows.length);
    const batchIds = recentBatches.map(b => b._id);
    
    const allInventory = await Inventory.find({
      batchId: { $in: batchIds }
    }).lean();

    const auditData = allInventory.map((inv, idx) => ({
      'S.No': idx + 1,
      'Batch Number': inv.batchNumber,
      'Batch ID': inv.batchId.toString(),
      'Product ID': inv.product.toString(),
      'Vendor ID': inv.vendor?.toString(),
      'Quantity': inv.quantity,
      'Free Quantity': inv.freeQuantity,
      'Total Quantity': inv.totalQuantity,
      'Raw Price': inv.rawPrice,
      'Sale Rate': inv.saleRate,
      'Scheme Sale Rate': inv.schemeSaleRate,
      'Expiry Date': inv.expiryDate,
      'Warehouse ID': LOCATION.warehouseId.toString(),
      'Zone ID': LOCATION.zoneId.toString(),
      'Rack ID': LOCATION.rackId.toString(),
      'Bin ID': LOCATION.binId.toString(),
      'Location Path': LOCATION.locationCodePath,
      'Created At': inv.createdAt,
      'Updated At': inv.updatedAt
    }));

    // Also create a failed rows sheet if any
    const auditSheet = XLSX.utils.json_to_sheet(auditData);
    const auditWorkbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(auditWorkbook, auditSheet, "Inventory_Audit");

    if (failedRows.length > 0) {
      const failedSheet = XLSX.utils.json_to_sheet(failedRows);
      XLSX.utils.book_append_sheet(auditWorkbook, failedSheet, "Failed_Rows");
    }

    XLSX.writeFile(auditWorkbook, "Final_Audit.xlsx");

    // =====================================================
    // FINAL SUMMARY
    // =====================================================
    console.log("\n" + "=".repeat(60));
    console.log("📊 FINAL SUMMARY");
    console.log("=".repeat(60));
    console.log(`📦 Total Rows Read: ${rows.length}`);
    console.log(`✅ Successful: ${successCount}`);
    console.log(`❌ Failed: ${failedCount}`);
    console.log(`📁 Audit File: Final_Audit.xlsx`);
    if (failedRows.length > 0) {
      console.log(`\n❌ Failed Rows Details:`);
      failedRows.slice(0, 10).forEach(failed => {
        console.log(`   Row ${failed.rowIndex}: ${failed.batchNo} - ${failed.error}`);
      });
      if (failedRows.length > 10) {
        console.log(`   ... and ${failedRows.length - 10} more failures`);
      }
    }
    console.log("=".repeat(60));

    process.exit(0);
    
  } catch (err) {
    console.log(`❌ Main process error: ${err.message}`);
    console.log(err.stack);
    process.exit(1);
  }
};

main();