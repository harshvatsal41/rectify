const fs = require("fs");
const path = require("path");
const connectDB = require("./Db_DataBackup/Connect");
const { Batch } = require("./Db_DataBackup/Models/batch");

const ver_path = path.join(__dirname, "ver_output");

const datasets = [
  require("./sep_output/1_PO_GRN.json"),
  require("./sep_output/2_Manual_Added.json"),
  require("./sep_output/4_Auto_Sold.json"),
];

const checker = async () => {
  await connectDB();

  console.log("🔥 Running PHASE-based inventory-batch integrity check...");

  // STEP 1: merge only selected datasets
  const inventories = datasets.flat();

  console.log("📦 Phase inventories:", inventories.length);

  // STEP 2: collect batchIds
  const batchIds = [
    ...new Set(
      inventories.map(i => i.batchId?.toString()).filter(Boolean)
    ),
  ];

  // STEP 3: fetch valid batches
  const existingBatches = await Batch.find(
    { _id: { $in: batchIds } },
    { _id: 1 }
  ).lean();

  const validBatchSet = new Set(
    existingBatches.map(b => b._id.toString())
  );

  // STEP 4: find orphan inventories
  const orphanInventories = [];

  inventories.forEach(inv => {
    const batchId = inv.batchId?.toString();

    if (!batchId || !validBatchSet.has(batchId)) {
      orphanInventories.push({
        inventoryId: inv._id,
        batchId: inv.batchId,
        product: inv.product,
        dataset: inv.dataset || "UNKNOWN",
        reason: !batchId ? "NO_BATCH_ID" : "BATCH_NOT_FOUND",
      });
    }
  });

  // STEP 5: report
  const report = {
    phase: "PO_GRN + Manual_Added + Auto_Sold",
    totalInventories: inventories.length,
    validBatches: validBatchSet.size,
    orphanCount: orphanInventories.length,
    orphanInventories,
  };

  fs.writeFileSync(
    path.join(ver_path, "phase_inventory_check.json"),
    JSON.stringify(report, null, 2)
  );

  console.log("📁 Saved: phase_inventory_check.json");

  console.log(`
📊 PHASE CHECK RESULT:
Total: ${inventories.length}
Valid Batches: ${validBatchSet.size}
Orphans: ${orphanInventories.length}
  `);

  process.exit();
};

checker()
  .then(() => {
    console.log("✅ DONE");
    process.exit(0);
  })
  .catch(err => {
    console.error("❌ ERROR:", err);
    process.exit(1);
  });

module.exports = { checker };