const fs = require("fs");
const path = require("path");
const connectDB = require("./Db_DataBackup/Connect");
const { Inventory } = require("./Db_DataBackup/Models/inventory");
const { Batch } = require("./Db_DataBackup/Models/batch");
const { Warehouse } = require("./Db_DataBackup/Models/warehouse");

const sep_path = path.join(__dirname, "sep_output");

// ensure folder exists
if (!fs.existsSync(sep_path)) {
  fs.mkdirSync(sep_path);
}

var BatchMap


const checkDuplicates = async (name, data) => {
  const map = {};

  // Step 1: group by batchId
  data.forEach((item) => {
    const batchId = item.batchId?.toString();
    const invId = item._id?.toString();

    if (!batchId || !invId) return;

    if (!map[batchId]) map[batchId] = [];
    map[batchId].push(item);
  });

  // Step 2: filter duplicates
  const duplicates = {};
  for (const batchId in map) {
    if (map[batchId].length > 1) {
      duplicates[batchId] = map[batchId];
    }
  }

  const detailedReport = [];

  // Step 3: deep validation
  for (const batchId in duplicates) {
    const batch = await Batch.findById(batchId).lean();

    if (!batch) {
      detailedReport.push({
        batchId,
        error: "Batch not found",
        inventories: duplicates[batchId].map((i) => i._id),
      });
      continue;
    }

    const batchProduct = batch.product?.toString();

    const inventoryAnalysis = duplicates[batchId].map((inv) => {
      const invProduct = inv.product?.toString();

      // Extract sale references
      const saleRefs = inv.movementHistory
        ?.filter((m) => m.type === "sale")
        .map((m) => m.referenceId);

      const isProductMatch = invProduct === batchProduct;

      const priceMismatch =
        inv.rawPrice !== batch.rawPrice ||
        inv.saleRate !== batch.saleRate ||
        inv.schemeSaleRate !== batch.schemeSaleRate;

      let status = [];

      if (!isProductMatch) {
        status.push("WRONG_BATCH_PRODUCT_MISMATCH");
      }

      if (priceMismatch) {
        status.push("SUSPICIOUS_PRICE_MISMATCH");
      }

      if (status.length === 0) {
        status.push("MATCHED");
      }

      console.log(status);

      return {
        inventoryId: inv._id,
        product: inv.product,
        batchProduct: batch.product,
        batchId: batchId,

        status,

        inventoryData: {
          rawPrice: inv.rawPrice,
          saleRate: inv.saleRate,
          schemeSaleRate: inv.schemeSaleRate,
          quantity: inv.quantity,
          vendor: inv.vendor,
          poReference: inv.poReference,
          grnReference: inv.grnReference,
        },

        batchData: {
          rawPrice: batch.rawPrice,
          saleRate: batch.saleRate,
          schemeSaleRate: batch.schemeSaleRate,
          supplier: batch.supplier,
          poReference: batch.poReference,
          grnReference: batch.grnReference,
        },

        saleReferenceIds: saleRefs || [],
      };
    });

    detailedReport.push({
      batchId,
      batchNumber: batch.batchNumber,
      batchProduct: batch.product,
      totalInventories: inventoryAnalysis.length,
      inventories: inventoryAnalysis,
    });
  }

  // Save duplicate summary
  if (detailedReport.length > 0) {
    fs.writeFileSync(
      path.join(sep_path, `${name}_duplicates_detailed.json`),
      JSON.stringify(detailedReport, null, 2),
    );
  }

  console.log(`📁 Detailed report saved: ${name}_duplicates_detailed.json`);
  console.log("detailed report batched detected :" , detailedReport.length)

  // Optional: summary counts

  let wrong = 0,
    matched = 0,
    suspicious = 0;

  detailedReport.forEach((batch) => {
    batch.inventories?.forEach((inv) => {
      if (inv.status.includes("WRONG_BATCH_PRODUCT_MISMATCH")) {
        wrong++;
      }

      if (inv.status.includes("SUSPICIOUS_PRICE_MISMATCH")) {
        suspicious++;
      }

      if (inv.status.includes("MATCHED")) {
        matched++;
      }
    });
  });

  

  console.log(`
📊 ${name} Summary:
✅ Matched: ${matched}
⚠ Suspicious: ${suspicious}
❌ Wrong Mapping: ${wrong}
`);
};

// // previous checker
// const checkDuplicates = (name, data) => {
//     // await connectDB();
//   const map = {}; // { batchId: [inventoryIds] }

//   data.forEach((item) => {
//     const batchId = item.batchId?.toString();
//     const invId = item._id?.toString();

//     if (!batchId || !invId) return;

//     if (!map[batchId]) {
//       map[batchId] = [];
//     }
//     map[batchId].push(invId);
//   });

//   // Extract only duplicates: batchId having more than 1 inventory record
//   const duplicates = {};
//   for (const batchId in map) {
//     if (map[batchId].length > 1) {
//       duplicates[batchId] = map[batchId];
//     }
//   }

// //   const Batches = await Batch.findById();

//   // Save duplicate report
//   if (Object.keys(duplicates).length > 0) {
//     fs.writeFileSync(
//       path.join(sep_path, `${name}_duplicates.json`),
//       JSON.stringify(duplicates, null, 2),
//     );
//   }

//   const totalDuplicates = Object.keys(duplicates).length;

//   console.log(
//     `🔍 ${name} → BatchIDs=${Object.keys(map).length}, Duplicates=${totalDuplicates}`,
//   );

//   if (totalDuplicates > 0) {
//     console.log(`⚠ ${totalDuplicates} duplicated batchIds found in ${name}`);
//   } else {
//     console.log(`✅ All batchIds are unique in ${name}`);
//   }
// };

const seperator = async () => {
  await connectDB();

  console.log("🔥 Connected. Starting extraction...");

  // 1) inv - PO GRN (poReference != null)
  const poGrn = await Inventory.find({
    poReference: { $ne: null },
  }).lean();

  

  // 2) inv - manual added (poReference = null AND receipt exists)
  const manualAdded = await Inventory.find({
    poReference: null,
    movementHistory: { $elemMatch: { type: "receipt" } },
  }).lean();
  

  // 3) inv - automation added but not sold (no sale entry, no receipt)
  const autoNotSold = await Inventory.find({
    poReference: null,
    movementHistory: { $not: { $elemMatch: { type: "sale" } } },
    "movementHistory.type": { $ne: "receipt" },
  }).lean();
  

  // 4) inv - automation added but sold (sale exists, no receipt)
  const autoSold = await Inventory.find({
    poReference: null,
    movementHistory: { $elemMatch: { type: "sale" } },
    "movementHistory.type": { $ne: "receipt" },
  }).lean();

//   checkDuplicates("poGrn", poGrn);
//   checkDuplicates("manualAdded", manualAdded);
//   checkDuplicates("autoNotSold", autoNotSold);
//   checkDuplicates("auto_sold", autoSold);


  await checkDuplicates("poGrn", poGrn);
  await checkDuplicates("manualAdded", manualAdded);
  await checkDuplicates("autoNotSold", autoNotSold);
  await checkDuplicates("auto_sold", autoSold);

  // Helper to save output
  const save = (name, data) => {
    fs.writeFileSync(
      path.join(sep_path, `${name}.json`),
      JSON.stringify(data, null, 2),
    );
    console.log(`✔ Saved ${name}.json (${data.length} records)`);
  };

  // Save all files
  save("1_PO_GRN", poGrn);
  console.log(poGrn.length);
  save("2_Manual_Added", manualAdded);
  console.log(manualAdded.length);
  save("3_Auto_Not_Sold", autoNotSold);
  console.log(autoNotSold.length);
  save("4_Auto_Sold", autoSold);
  console.log(autoSold.length);

  console.log("🎉 Done! Files generated successfully.");
  process.exit();
}

seperator()
 .then(() => {
    console.log("✅ DONE");
    process.exit(0);
  })
  .catch(err => {
    console.error("❌ ERROR:", err);
    process.exit(1);
  });

module.exports = {seperator}
