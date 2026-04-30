// const { main } = require("./Phase 1 - PO & GRN inventory/extract.js"); 
const { seperator } = require("./seperator.js");
const { verifier } = require("./verifier.js");
const {b_remover} = require("./b_remover.js");
const {checker}= require("./checker.js");
const { i_remover } = require("./i_remover.js");



// main();

// extract the json from the db
// -> live.batch.json
// -> live.inventory.json

// master inventory data from margbooks = MD
// Done placed in DB

const run = async () => {

// SEPARATE-R
//(1) inv - po grn
// --{poReference:{ $ne: null }}
//

//(2) inv - manual added
// --{
//   poReference: null,
//   movementHistory: {
//     $elemMatch: { type: "receipt" }
//   }
// }

//
//(3) inv - automation added not sold
// --{
//   poReference: null,
//   movementHistory: {
//     $not: {
//       $elemMatch: { type: "sale" }
//     }
//   },
//   "movementHistory.type": { $ne: "receipt" }
// }

//(4) inv - automation added but sold
// --{
//   poReference: null,
//   movementHistory: {
//     $elemMatch: { type: "sale" }
//   },
//   "movementHistory.type": { $ne: "receipt" }
// }

await seperator();

// batch verifier

await verifier();

// Batch Remover

await b_remover();

// check that rest of the inventory does have their batch 

await checker();


// excess inventory remover

await i_remover();

};


// filter and make a list of the products that are sold with productId , batch number , quantity and from which inventories they are sold and their refrenceID number also in the session they are sold 

await extractor();

// reducer

await Reducer();


// Upload inventory 

await Upload.js


// Master sheet inventory
//(1) inv - po grn - save it back 
//(2) inv - manual added - check there are no redundant batches in it.
//(3) inv - automation added not sold remove all of it from db
//(4) inv - automation added but sold = IS
//(4a) check weather there is any batch redundancy in it.
//(4b) if not then update the inventory and their batches to their sold (initial inventory == total sold quantity)
//(4c) check the sold item should all be present in master sheet 
//(4d) calculate the MD - IS = rest inventory 
//(4e) upload the rest of the inventory to the DB.
