const xlsx = require("xlsx");

// STEP 1: LOAD FILES
const masterSheet = xlsx.utils.sheet_to_json(
  xlsx.readFile("././Db_DataBackup/master_inv.xlsx").Sheets["PSData"]
);

const soldSheet = xlsx.utils.sheet_to_json(
  xlsx.readFile("./sales_report.xlsx").Sheets["Product_Batch_Summary"]
);

// STEP 2: BUILD MASTER MAP (SUM duplicates safely)
const masterMap = new Map();

masterSheet.forEach((row) => {
  const key = row.Matcher;
  const qty = Number(row["As Per Book"] || 0);

  if (!masterMap.has(key)) {
    masterMap.set(key, {
      ...row,
      Initial: 0,
    });
  }

  masterMap.get(key).Initial += qty;
});

// STEP 3: BUILD SOLD MAP (SUM sales)
const soldMap = new Map();

soldSheet.forEach((row) => {
  const key = row.Matcher;
  const qty = Number(row.Total_Quantity_Sold || 0);

  if (!soldMap.has(key)) {
    soldMap.set(key, 0);
  }

  soldMap.set(key, soldMap.get(key) + qty);
});

// STEP 4: PROCESS + VALIDATE
const finalMaster = [];
const errorReport = [];

// ALL MASTER KEYS
masterMap.forEach((master, key) => {
  const sold = soldMap.get(key) || 0;
  const initial = master.Initial;

  // CASE 1: OVER SOLD
  if (sold > initial) {
    finalMaster.push({
      ...master,
      Sold: sold,
      Remaining: 0,
    });

    errorReport.push({
      Matcher: key,
      Issue: "OVER_SOLD",
      Sold: sold,
      Initial: initial,
    });

    return;
  }

  // NORMAL CASE
  finalMaster.push({
    ...master,
    Sold: sold,
    Remaining: initial - sold,
  });
});

// CASE 2: SOLD BUT NOT IN MASTER
soldMap.forEach((soldQty, key) => {
  if (!masterMap.has(key)) {
    errorReport.push({
      Matcher: key,
      Issue: "MISSING_IN_MASTER",
      Sold: soldQty,
      Initial: 0,
    });
  }
});

// STEP 5: EXPORT EXCEL
const wb = xlsx.utils.book_new();

const ws1 = xlsx.utils.json_to_sheet(finalMaster);
const ws2 = xlsx.utils.json_to_sheet(errorReport);

xlsx.utils.book_append_sheet(wb, ws1, "MASTER_RECONCILED");
xlsx.utils.book_append_sheet(wb, ws2, "ERROR_REPORT");

xlsx.writeFile(wb, "./l_inventory_audit.xlsx");

console.log("✅ Inventory audit created");
console.log("📦 Master rows:", finalMaster.length);
console.log("⚠ Errors:", errorReport.length);