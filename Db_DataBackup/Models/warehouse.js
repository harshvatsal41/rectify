const mongoose = require("mongoose");
const { Schema, Types } = mongoose;


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


warehouseSchema.pre('save', function (next) {
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
    next();
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