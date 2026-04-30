const data = require("./zero.inventories.json");

const { Batch } = require("./Db_DataBackup/Models/batch");
const connectDB = require("./Db_DataBackup/Connect");
const mongoose = require("mongoose");

const main = async () => {
    await connectDB();

    console.log("Total records:", data.length);

    let success = 0;
    let failed = 0;

    for (const d of data) {

        const batchId = d.batchId?.$oid || d.batchId;

        if (!mongoose.Types.ObjectId.isValid(batchId)) {
            console.log("❌ Invalid ID:", batchId);
            failed++;
            continue;
        }

        try {
            const updated = await Batch.findByIdAndUpdate(
                batchId,
                {
                    $set: {
                        freeQuantity: 0,
                        availableQuantity: 0
                    }
                },
                { new: true }
            );

            if (!updated) {
                console.log("⚠️ Not found:", batchId);
                failed++;
            } else {
                console.log("✅ Updated:", updated._id.toString());
                success++;
            }

        } catch (err) {
            console.log("❌ Error:", batchId, err.message);
            failed++;
        }
    }

    console.log("\n======================");
    console.log("✅ Success:", success);
    console.log("❌ Failed:", failed);
    console.log("======================");

    process.exit(0);
};

main();