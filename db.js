const sqlite3 = require('sqlite3').verbose();

// Open the SQLite database (or create it if it doesn't exist)
const db = new sqlite3.Database('./new2.db', (err) => {
  if (err) {
    console.error('Error opening SQLite database:', err);
  } else {
    console.log('SQLite database connected.');
  }
});

// Create a new table for storing shop details (shopName and accessToken)
db.run(`
  CREATE TABLE IF NOT EXISTS shop (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shopName TEXT NOT NULL,
    accessToken TEXT NOT NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(shopName) -- ensures the shopName is unique
  )
`, (err) => {
  if (err) {
    console.error('Error creating shop table:', err);
  } else {
    console.log('shop table created or already exists.');
  }
});

db.run(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shopify_order_no TEXT NOT NULL UNIQUE,
    factory_price_order_no TEXT NOT NULL UNIQUE,
    cancelled INTEGER DEFAULT 0,  -- Boolean (0 for false, 1 for true)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`, (err) => {
  if (err) {
    console.error('Error creating table:', err);
  } else {
    console.log('Table "orders" is ready.');
  }
});
// Create the shop_details table if it doesn't exist
db.run(`
  CREATE TABLE IF NOT EXISTS shop_details (
    id INTEGER PRIMARY KEY AUTOINCREMENT ,
    shopID TEXT NOT NULL ,
    apikey TEXT NOT NULL,
    apiSecret TEXT NOT NULL,
    apiurl TEXT NOT NULL,
    syncProducts BOOLEAN DEFAULT FALSE,
    syncOrders BOOLEAN DEFAULT FALSE,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`, (err) => {
  if (err) {
    console.error('Error creating shop_details table:', err);
  } else {
    console.log('shop_details table created or already exists.');
  }
});

// Function to insert or update shop details
// Update the upsertShopDetails function to handle accessToken
const upsertShopDetails = (shopID, apikey, apiSecret, apiurl, syncProducts, syncOrders, callback) => {
  // Step 1: Clean up any duplicates if they exist
  db.serialize(() => {
    // First, check for any duplicate shopID records
    db.run("BEGIN TRANSACTION"); // Start a transaction for atomicity
    console.log("deleting")
    // Remove duplicate rows (keeping the first row for each shopID)
    db.run(`
      DELETE FROM shop_details WHERE rowid NOT IN (
        SELECT MIN(rowid) FROM shop_details GROUP BY shopID
      );
    `, function(err) {
      if (err) {
        console.error('Error cleaning up duplicates:', err);
        db.run("ROLLBACK"); // Rollback if cleanup fails
        return callback(err);
      }
      console.log("Deleted")
      // Step 2: Ensure the table schema has UNIQUE constraint on shopID (we recreate the table if needed)
      db.get('PRAGMA foreign_keys;', (err, result) => {
        if (err) {
          console.error('Error checking foreign keys:', err);
          db.run("ROLLBACK");
          return callback(err);
        }
        console.log("Step 2 ")
        // Step 3: Check if the `shop_details` table already has the UNIQUE constraint on shopID
        db.get(`
          PRAGMA table_info(shop_details);
        `, (err, columns) => {
          if (err) {
            console.error('Error fetching table info:', err);
            db.run("ROLLBACK");
            return callback(err);
          }

          // If no UNIQUE constraint exists, we need to create the table again
          const hasUniqueConstraint = columns.some(col => col.name === 'shopID' && col.unique);
          if (!hasUniqueConstraint) {
            // Recreate table with UNIQUE constraint on shopID
            db.run(`
              CREATE TABLE shop_details_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                shopID TEXT NOT NULL UNIQUE,
                apikey TEXT NOT NULL,
                apiSecret TEXT NOT NULL,
                apiurl TEXT NOT NULL,
                syncProducts BOOLEAN DEFAULT FALSE,
                syncOrders BOOLEAN DEFAULT FALSE,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
              );
            `, (err) => {
              if (err) {
                console.error('Error creating new table with UNIQUE constraint:', err);
                db.run("ROLLBACK");
                return callback(err);
              }
              console.log("Step 3 ")

              // Copy the data from the old table to the new one
              db.run(`
                INSERT INTO shop_details_new (id, shopID, apikey, apiSecret, apiurl, syncProducts, syncOrders, createdAt)
                SELECT id, shopID, apikey, apiSecret, apiurl, syncProducts, syncOrders, createdAt
                FROM shop_details;
              `, function(err) {
                if (err) {
                  console.error('Error copying data to new table:', err);
                  db.run("ROLLBACK");
                  return callback(err);
                }

                // Drop the old table and rename the new one
                db.run('DROP TABLE shop_details', (err) => {
                  if (err) {
                    console.error('Error dropping old table:', err);
                    db.run("ROLLBACK");
                    return callback(err);
                  }

                  db.run('ALTER TABLE shop_details_new RENAME TO shop_details', (err) => {
                    if (err) {
                      console.error('Error renaming new table:', err);
                      db.run("ROLLBACK");
                      return callback(err);
                    }
                  });
                });
              });
            });
          }
        });
      });
    });

    // Step 4: Perform the upsert (INSERT or UPDATE based on existing shopID)
    db.get('SELECT * FROM shop_details WHERE shopID = ?', [shopID], (err, row) => {
      if (err) {
        console.error('Error checking shop details:', err);
        db.run("ROLLBACK"); // Rollback on error
        return callback(err);
      }
      console.log("row",row)
      if (row) {
        // If the shop exists, perform an update
        db.run(`
          UPDATE shop_details
          SET apikey = ?, apiSecret = ?, apiurl = ?, syncProducts = ?, syncOrders = ?
          WHERE shopID = ?
        `, [apikey, apiSecret, apiurl, syncProducts, syncOrders, shopID], function(err) {
          if (err) {
            console.error('Error updating shop details:', err);
            db.run("ROLLBACK"); // Rollback on error
            return callback(err);
          }
          // Commit the transaction after updating
          db.run("COMMIT");
          console.log("OK")
          callback(null, {
            id: row.id, // Use the existing row ID
            shopID,
            apikey,
            apiSecret,
            apiurl,
            syncProducts,
            syncOrders
          });
        });
      } else {
        // If the shop doesn't exist, perform an insert
        db.run(`
          INSERT INTO shop_details (shopID, apikey, apiSecret, apiurl, syncProducts, syncOrders)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [shopID, apikey, apiSecret, apiurl, syncProducts, syncOrders], function(err) {
          if (err) {
            console.error('Error inserting shop details:', err);
            db.run("ROLLBACK"); // Rollback on error
            return callback(err);
          }
          // Commit the transaction after inserting
          db.run("COMMIT");

          callback(null, {
            id: this.lastID, // ID of the newly inserted row
            shopID,
            apikey,
            apiSecret,
            apiurl,
            syncProducts,
            syncOrders
          });
        });
      }
    });
  });
};








// Function to find a shop by its name
// Function to get shopID by shopName



// Function to fetch all shops (optional, can be useful for debugging)
const getAllShopDetails = (callback) => {
  db.all(`SELECT * FROM shop_details`, [], (err, rows) => {
    if (err) {
      console.error('Error fetching all shop details:', err);
      return callback(err);
    }
    callback(null, rows);
  });
};


async function SaveShop(shop,accessToken){
  try {
    // Check if the shop already exists in the shop_tokens table
    db.run(`
      INSERT OR IGNORE INTO shop (shopName, accessToken)
      VALUES (?, ?)
    `, [shop, accessToken], function(err) {
      if (err) {
        console.error('Error saving shop token:', err);
        return 0
      } else {
        if (this.changes === 0) {
          console.log(`Shop '${shop}' already exists in the database.`);
          return 1
        } else {
          console.log(`Shop '${shop}' and its accessToken saved to the database.`);
          return 1
        }
      }
    });}
    catch(e){
      console.log(e)
      return 0
    }
}

async function SaveUserData(shopID, apiKey, apiSecret, apiUrl) {
  return new Promise((resolve, reject) => {
    db.run(`
      INSERT INTO shop_details (shopID, apiKey, apiSecret, apiUrl)
      VALUES (?, ?, ?, ?)`,
      [shopID, apiKey, apiSecret, apiUrl],
      function(err) {
        if (err) {
          console.error('Error saving API settings:', err);
          reject(err);
        } else {
          resolve({ id: this.lastID, shopID, apiKey, apiSecret, apiUrl });
        }
      });
  });
}


// Function to get shopID by shopName

const getShopIDByShopName = (shopName, callback) => {
  db.get('SELECT id FROM shop WHERE shopName = ?', [shopName], (err, row) => {
    if (err) {
      console.error('Error querying shop table:', err);
      return callback(err);
    }

    if (row) {
      console.log('Shop found:', row); // Log found shop data
      callback(null, row.id); // Return the shopID
    } else {
      console.log('No shop found with name:', shopName);
      callback(new Error('Shop not found'), null); // Shop not found
    }
  });
};
const getShopAPIDataByShopID = (shopID, callback) => {
  db.all(
    `SELECT * FROM shop_details WHERE shopID = ?`,
    [shopID],
    (err, rows) => {
      if (err) {
        console.error('Error querying shop_details table:', err);
        return callback(err);
      }

      if (rows.length > 0) {
        console.log('Shop data found:', rows); // Log all rows for the given shopID
        callback(null, rows); // Return all rows
      } else {
        console.log('No data found for shopID:', shopID);
        callback(new Error('No data found for this shopID'), null); // No rows found
      }
    }
  );
};

const addOrder = (shopifyOrderNo, factoryPriceOrderNo, cancelled =0) => {
  return new Promise((resolve, reject) => {
    const query = `INSERT INTO orders (shopify_order_no, factory_price_order_no, cancelled) VALUES (?, ?, ?)`;

    db.run(query, [shopifyOrderNo, factoryPriceOrderNo, cancelled], function (err) {
      if (err) {
        if (err.code === 'SQLITE_CONSTRAINT') {
          // Handle unique constraint violation
          reject(`Order with Shopify Order No: ${shopifyOrderNo} or Factory Price Order No: ${factoryPriceOrderNo} already exists.`);
        } else {
          console.error('Error adding order:', err);
          reject(err);
        }
      } else {
        console.log(`Order added with Shopify Order No: ${shopifyOrderNo} and Factory Price Order No: ${factoryPriceOrderNo}`);
        resolve(this.lastID); // Returns the id of the inserted order
      }
    });
  });
};


// To update the cancellation status of an order
const updateOrderCancellationStatus = (shopifyOrderNo, cancelled) => {
  return new Promise((resolve, reject) => {
    const query = `UPDATE orders SET cancelled = ? WHERE shopify_order_no = ? `;

    db.run(query, [cancelled, shopifyOrderNo], function (err) {
      if (err) {
        console.error('Error updating order cancellation status:', err);
        reject(err);
      } else {
        resolve(`Order with Shopify Order No: ${shopifyOrderNo}  updated.`);
      }
    });
  });
};


// const getShopAPIDataByShopID = (shopID, callback) => {
//   db.get('SELECT apiKey, apiSecret, apiUrl FROM shop_details WHERE shopID = ?', [shopID], (err, row) => {
//     if (err) {
//       console.error('Error querying shop_details table:', err);
//       return callback(err);
//     }

//     if (row) {
//       console.log('API details found:', row); // Log API details
//       callback(null, row); // Return the API details
//     } else {
//       console.log('No API details found for shopID:', shopID);
//       callback(new Error('API details not found for this shop'), null); // API details not found
//     }
//   });
// };


// Function to delete API data by id (unique identifier)
const deleteShopAPIData = (id) => {
  return new Promise((resolve, reject) => {
    // Start a transaction for atomicity
    db.run("BEGIN TRANSACTION", (err) => {
      if (err) {
        console.error("Error starting transaction:", err);
        return reject(new Error('Error starting transaction'));
      }

      // Perform the deletion based on the id
      db.run(`DELETE FROM shop_details WHERE id = ?`, [id], function (err) {
        if (err) {
          console.error('Error deleting API data:', err);
          db.run("ROLLBACK"); // Rollback if deletion fails
          return reject(new Error('Error deleting API data'));
        }

        // Commit the transaction after successful deletion
        db.run("COMMIT", (err) => {
          if (err) {
            console.error('Error committing transaction:', err);
            return reject(new Error('Error committing transaction'));
          }

          console.log(`Successfully deleted API data with id: ${id}`);
          resolve({ message: `API data with id ${id} deleted successfully` });
        });
      });
    });
  });
};

// Export the db object and functions
module.exports = {
  db,
  deleteShopAPIData,
  getShopIDByShopName,
  upsertShopDetails,
  getAllShopDetails,
  SaveShop,
  getShopAPIDataByShopID,
  SaveUserData,
  updateOrderCancellationStatus,
  addOrder
};
