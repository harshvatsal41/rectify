const xlsx = require("xlsx");
const fs = require("fs");
const path = require("path");
const connectDB = require("./Db_DataBackup/Connect");
const { Inventory } = require("./Db_DataBackup/Models/inventory");

const extractor = async () => {
  await connectDB();

  const autoSold = await Inventory.find({
    poReference: null,
    movementHistory: { $elemMatch: { type: "sale" } },
    "movementHistory.type": { $ne: "receipt" },
  }).lean();

  const detailSheet = [];
  const summaryMap = new Map();

  // STEP 1: build detailed + summary
  autoSold.forEach((inv) => {
    const sales = inv.movementHistory?.filter(m => m.type === "sale");

    if (!sales) return;

    sales.forEach((sale) => {
      const qty = Math.abs(sale.quantityChange || 0);

      const row = {
        Inventory_ID: inv._id?.toString(),
        Product_ID: inv.product?.toString(),
        Batch_ID: inv.batchId?.toString(),
        Batch_Number: inv.batchNumber,
        Quantity_Sold: qty,
        Sale_Reference_ID: sale.referenceId || "",
        Sale_Date: sale.date,
        User_ID: sale.userId || "",
        Notes: sale.notes || "",
      };

      detailSheet.push(row);

      // 🔥 SUMMARY KEY: product + batch
      const key = `${row.Product_ID}_${row.Batch_Number}`;

      if (!summaryMap.has(key)) {
        summaryMap.set(key, {
          Product_ID: row.Product_ID,
          Batch_Number: row.Batch_Number,
          Total_Quantity_Sold: 0,
          Matcher : `${row.Product_ID}|${row.Batch_Number}`
        });
      }

      summaryMap.get(key).Total_Quantity_Sold += qty;
    });
  });

  // STEP 2: convert summary map → array
  const summarySheet = Array.from(summaryMap.values());

  // STEP 3: create workbook
  const workbook = xlsx.utils.book_new();

  const ws1 = xlsx.utils.json_to_sheet(detailSheet);
  const ws2 = xlsx.utils.json_to_sheet(summarySheet);

  xlsx.utils.book_append_sheet(workbook, ws1, "Detailed_Sales");
  xlsx.utils.book_append_sheet(workbook, ws2, "Product_Batch_Summary");

  // STEP 4: write file
  const filePath = path.join(__dirname, "sales_report.xlsx");

  xlsx.writeFile(workbook, filePath);

  console.log("📊 Excel generated:", filePath);
  console.log("📦 Detail rows:", detailSheet.length);
  console.log("📈 Summary rows:", summarySheet.length);
};

extractor()
 .then(() => {
    console.log("✅ DONE");
    process.exit(0);
  })
  .catch(err => {
    console.error("❌ ERROR:", err);
    process.exit(1);
  });

module.exports = { extractor };