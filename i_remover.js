const fs = require("fs");
const path = require("path");
const connectDB = require("./Db_DataBackup/Connect");
const { Inventory } = require("./Db_DataBackup/Models/inventory");

const i_remover = async () => {
  await connectDB();

  console.log("🔥 Starting Inventory cleanup (phase-based)...");

  // STEP 1: load allowed datasets
  const data1 = require("./sep_output/1_PO_GRN.json");
  const data2 = require("./sep_output/2_Manual_Added.json");
  const data4 = require("./sep_output/4_Auto_Sold.json");

  console.log(data1.length , " : " ,data2.length , " : ",data4.length , " : ")

  const allowed = [...data1, ...data2, ...data4];

  // STEP 2: build KEEP set (inventory IDs)
  const keepInventoryIds = new Set(
    allowed.map(i => i._id?.toString()).filter(Boolean)
  );

  console.log("📦 Keep inventories:", keepInventoryIds.size);

  // STEP 3: fetch ALL inventories from DB
  const allInventories = await Inventory.find({}, { _id: 1 }).lean();

  console.log("📊 Total DB inventories:", allInventories.length);

  // STEP 4: find DELETE list
  const deleteIds = [];

  allInventories.forEach(inv => {
    const id = inv._id.toString();

    if (!keepInventoryIds.has(id)) {
      deleteIds.push(id);
    }
  });

  console.log("❌ To delete:", deleteIds.length);

  // STEP 5: safety backup file
  fs.writeFileSync(
    path.join(__dirname, "ver_output", "inventory_delete_backup.json"),
    JSON.stringify(deleteIds, null, 2)
  );

  console.log("📁 Backup saved before deletion");

  // ⚠️ STEP 6: DELETE (UNCOMMENT ONLY WHEN READY)
  
  const result = await Inventory.deleteMany({
    _id: { $in: deleteIds }
  });

  console.log("🗑 Deleted inventories:", result.deletedCount);
  

  console.log("🎉 Cleanup completed safely");

  process.exit();
};

i_remover()
  .then(() => {
    console.log("✅ DONE");
    process.exit(0);
  })
  .catch(err => {
    console.error("❌ ERROR:", err);
    process.exit(1);
  });

module.exports = { i_remover };