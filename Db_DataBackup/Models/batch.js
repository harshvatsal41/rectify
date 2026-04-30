const mongoose = require("mongoose");
const { Schema, Types } = mongoose;


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

module.exports = {Batch};