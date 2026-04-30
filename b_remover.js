const fs = require("fs");
const path = require("path");
const connectDB = require("./Db_DataBackup/Connect");
const { Batch } = require("./Db_DataBackup/Models/batch");

const b_remover = async () => {
  await connectDB();

  const filePath = path.join(__dirname, "ver_output", "batch_full_trace.json");

  if (!fs.existsSync(filePath)) {
    console.log("❌ batch_full_trace.json not found");
    return;
  }

  const fullTrace = JSON.parse(fs.readFileSync(filePath, "utf-8"));

  const validBatchIds = new Set(
    fullTrace.map(b => b.batchId?.toString()).filter(Boolean)
  );

  const allBatches = await Batch.find({}, { _id: 1 }).lean();

  const toDelete = [];

  allBatches.forEach(batch => {
    const id = batch._id.toString();

    if (!validBatchIds.has(id)) {
      toDelete.push(id);
    }
  });

  console.log("❌ Batches to delete:", toDelete.length);

  fs.writeFileSync(
    path.join(__dirname, "ver_output", "delete_batches.json"),
    JSON.stringify(toDelete, null, 2)
  );

  console.log("📁 delete_batches.json created");

  // ⚠️ UNCOMMENT ONLY WHEN READY
  
  const result = await Batch.deleteMany({
    _id: { $in: toDelete }
  });

  console.log("🗑 Deleted:", result.deletedCount);
  
};

// RUN
b_remover()
  .then(() => {
    console.log("✅ DONE");
    process.exit(0);
  })
  .catch(err => {
    console.error("❌ ERROR:", err);
    process.exit(1);
  });

module.exports = { b_remover };