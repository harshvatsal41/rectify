const data1 = require("./sep_output/1_PO_GRN.json");
const data2 = require("./sep_output/2_Manual_Added.json");
const data3 = require("./sep_output/3_Auto_Not_Sold.json");
const data4 = require("./sep_output/4_Auto_Sold.json");

const fs = require("fs");
const path = require("path");

const ver_path = path.join(__dirname, "ver_output");

// ensure folder exists
if (!fs.existsSync(ver_path)) {
  fs.mkdirSync(ver_path);
}

const datasets = [
  { name: "1_PO_GRN", data: data1 },
  { name: "2_Manual_Added", data: data2 },
//   { name: "3_Auto_Not_Sold", data: data3 },
  { name: "4_Auto_Sold", data: data4 },
];

const datalength = data1.length+data2.length+data4.length;
console.log(datalength);

const batchMap = new Map();

const verifier = async () =>{

    /**
 * Step 1: Build full trace map
 */
datasets.forEach((sheet) => {
  sheet.data.forEach((inv) => {
    const batchId = inv.batchId?.toString();
    const inventoryId = inv._id?.toString();

    if (!batchId || !inventoryId) return;

    if (!batchMap.has(batchId)) {
      batchMap.set(batchId, []);
    }

    batchMap.get(batchId).push({
      inventoryId,
      dataset: sheet.name,
      product: inv.product?.toString(),
      rawPrice: inv.rawPrice,
      saleRate: inv.saleRate,
    });
  });
});

/**
 * Step 2: FULL TRACE (ALL BATCHES)
 */
const fullTrace = [];

for (const [batchId, inventories] of batchMap.entries()) {
  fullTrace.push({
    batchId,
    totalInventories: inventories.length,
    isDuplicate: inventories.length > 1,
    inventories,
  });
};

/**
 * Step 3: DUPLICATE ONLY
 */
const duplicateOnly = fullTrace.filter((b) => b.isDuplicate);

/**
 * Step 4: SAVE FILES
 */



console.log("full trace :",fullTrace.length)
fs.writeFileSync(
  path.join(ver_path, "batch_full_trace.json"),
  JSON.stringify(fullTrace, null, 2)
);

fs.writeFileSync(
  path.join(ver_path, "batch_duplicates_only.json"),
  JSON.stringify(duplicateOnly, null, 2)
);

console.log("✅ Full trace saved: batch_full_trace.json");
console.log("⚠ Duplicate batches found:", duplicateOnly.length);
console.log("📦 Duplicate file saved: batch_duplicates_only.json");

let status = "";

status += `✅FULL TRACE COUNT: ${fullTrace.length}\n`;
status += `TOTAL INPUT RECORDS: ${datalength}\n`;
status += `⚠DUPLICATE BATCHES FOUND: ${duplicateOnly.length}\n`;
status += `MISSING/UNMAPPED RECORDS: ${datalength - fullTrace.length}\n`;

status += `\nFILES GENERATED:\n`;
status += `- batch_full_trace.json\n`;
status += `- batch_duplicates_only.json\n`;

fs.writeFileSync(
  path.join(ver_path, "status_report.txt"),
  status
);
}



verifier()
 .then(() => {
    console.log("✅ DONE");
    process.exit(0);
  })
  .catch(err => {
    console.error("❌ ERROR:", err);
    process.exit(1);
  });

module.exports = {verifier}