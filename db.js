const sqlite3 = require('sqlite3').verbose();

// Open the SQLite database (or create it if it doesn't exist)
const db = new sqlite3.Database('./new.db', (err) => {
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
    priceAdjustmentType TEXT NOT NULL DEFAULT 'fixed', -- Type of price adjustment: 'fixed' or 'percentage'
    priceAdjustmentAmount REAL NOT NULL DEFAULT 0,    -- Amount of price adjustment (could be a fixed value or a percentage)
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

db.run(`
  CREATE TABLE IF NOT EXISTS shop_sync_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL, -- Foreign key linking to the shop table
    sync_type TEXT NOT NULL CHECK(sync_type IN ('all', 'categories', 'product_ids')), -- Sync type: 'all', 'categories', or 'product_ids'
    selected_categories TEXT, -- Stores a comma-separated list of category IDs (if sync_type is 'categories')
    selected_product_ids TEXT, -- Stores a comma-separated list of product IDs (if sync_type is 'product_ids')
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shop_id) REFERENCES shop(id) ON DELETE CASCADE
  )
`, (err) => {
  if (err) {
    console.error('Error creating shop_sync_settings table:', err);
  } else {
    console.log('shop_sync_settings table created or already exists.');
  }
});
db.run(`CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  productID TEXT NOT NULL UNIQUE,
  ModelID TEXT,
  model TEXT,
  color TEXT,
  gender TEXT,
  category TEXT,
  producer TEXT,
  suggested_price_netto_pln REAL,
  wholesale_price_netto_pln REAL,
  vat INTEGER,
  photo_link_small TEXT,
  photo_link_large TEXT,
  material_composition TEXT,
  washing_recipe TEXT,
  description TEXT,
  sizechart TEXT,
  variants TEXT,
  pictures  TEXT
);
`);

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
  CREATE TABLE IF NOT EXISTS shop_api_settings (
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
const saveProductToDB = async (productData) => {
  try {
    // Convert pictures and variants to JSON strings for database storage
    const variants = JSON.stringify(productData.variants || []);
    const pictures = JSON.stringify(productData.pictures || []);

    console.log("Saving Product Data:", {
      productID: productData.productID,
      ModelID: productData.ModelID,
      model: productData.model,
      variants: variants,
      pictures: pictures
    });

    // Insert the product into the database
    const result = await new Promise((resolve, reject) => {
      db.run(`
        INSERT INTO products (
          productID, ModelID, model, color, gender, category, producer,
          suggested_price_netto_pln, wholesale_price_netto_pln, vat,
          photo_link_small, photo_link_large, material_composition, washing_recipe,
          description, sizechart, variants, pictures
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?)
      `, [
        productData.productID?._text || "Some",
        productData.ModelID?._text || "Some",
        productData.model?._text || "Some",
        productData.color?._text || "Some",
        productData.gender?._text || "Some",
        productData.category?._text || "Some",
        productData.producer?._cdata || "Some",
        parseFloat(productData.suggested_price_netto_pln?._text || 0),
        parseFloat(productData.wholesale_price_netto_pln?._text || 0),
        parseInt(productData.vat?._text || "0"),
        productData.photo_link_small?._text || "Some",
        productData.photo_link_large?._text || "Some",
        productData.material_composition?._cdata || "Some",
        productData.washing_recipe?._cdata || "Some",
        productData.description?._cdata || "Some",
        productData.sizechart?._text || "Some",
        variants ||"some",  // Save the variants as a JSON string
        pictures || "Some"  // Save the pictures as a JSON string
      ], function (err) {
        if (err) {
          console.error("Error saving Product to DB:", err);
          return reject(err);
        } else {
          console.log(`Product saved to the database. ID: ${this.lastID}`);
          return resolve(this);
        }
      });
    });

    return result;
  } catch (e) {
    console.error("Error in saveProductToDB:", e);
    return null;
  }
};





const getAllProductsFromDB = async (limit = 100, offset = 0) => {
  try {
    // Query to retrieve all products with pagination (limit and offset)
    const products = await new Promise((resolve, reject) => {
      const query = `SELECT * FROM products LIMIT ? OFFSET ?`;
      db.all(query, [limit, offset], (err, rows) => {
        if (err) {
          console.error('Error retrieving products from DB', err);
          return reject(err);  // Reject the promise if there's an error
        }
        resolve(rows);  // Resolve with products data
      });
    });

    return products;  // Return the list of products
  } catch (e) {
    console.error('Error in getAllProductsFromDB:', e);
    return [];  // Return empty array if there's an error
  }
};



const getProductsByCategoryFromDB = async (categories, limit, offset) => {
  try {
    // Wrap db.all in a promise to use async/await
    const products = await new Promise((resolve, reject) => {
      // Modify the SQL query to select products based on categories
      const placeholders = categories.map(() => '?').join(', ');  // Create a list of placeholders for categories
      const query = `SELECT * FROM products WHERE category IN (${placeholders}) LIMIT ? OFFSET ?`;

      db.all(query, [...categories, limit, offset], (err, rows) => {
        if (err) {
          console.error('Error retrieving products by category from DB', err);
          return reject(err);  // Reject the promise if there's an error
        }
        resolve(rows);  // Resolve the promise with the result (array of products)
      });
    });

    return products;  // Return the array of products
  } catch (e) {
    console.error('Error in getProductsByCategoryFromDB:', e);
    return [];  // Return an empty array if there's an error
  }
};

const getProductsByIdsFromDB = async (productIds, limit = 100, offset = 0) => {
  try {
    // Create placeholders for product IDs in the query
    const placeholders = productIds.map(() => '?').join(', ');
    const query = `SELECT * FROM products WHERE id IN (${placeholders}) LIMIT ? OFFSET ?`;

    const products = await new Promise((resolve, reject) => {
      db.all(query, [...productIds, limit, offset], (err, rows) => {
        if (err) {
          console.error('Error retrieving products by ID from DB', err);
          return reject(err);
        }
        resolve(rows);
      });
    });

    return products;
  } catch (e) {
    console.error('Error in getProductsByIdsFromDB:', e);
    return [];
  }
};


const getProductsByProductIDsFromDB = async (productIDs) => {
  console.log("productIDs",productIDs)
  try {
    const products = [];

    await Promise.all(
      productIDs.map(async (productID) => {
        const product = await new Promise((resolve, reject) => {
          const query = `SELECT * FROM products WHERE id = ?`;
          db.get(query, [productID], (err, row) => {
            if (err) {
              console.error(`Error retrieving product with productID ${productID} from DB`, err);
              console.log("row",row)
              return reject(err);
            }
            resolve(row); // Resolve with the product (row)
          });
        });
        if (product) products.push(product); // Add the product to the array
      })
    );

    return products; // Return the array of products
  } catch (e) {
    console.error('Error in getProductsByProductIDsFromDB:', e);
    return []; // Return an empty array if there's an error
  }
};


// Add this function to your db logic
const countProducts = async () => {
  try {
    const count = await new Promise((resolve, reject) => {
      // SQL query to count the total number of products
      db.get('SELECT COUNT(*) AS total FROM products', (err, row) => {
        if (err) {
          console.error('Error counting products:', err);
          return reject(err);  // Reject the promise if there's an error
        }
        resolve(row.total);  // Resolve with the total count of products
      });
    });
    return count;  // Return the count
  } catch (e) {
    console.error('Error in countProducts:', e);
    return 0;  // Return 0 if there's an error
  }
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

const updatePriceAdjustment = (shopName, newType, newAmount) => {
  return new Promise((resolve, reject) => {
    // Validate input values
    if (newType !== 'fixed' && newType !== 'percentage') {
      return reject(new Error('Invalid price adjustment type. It should be either "fixed" or "percentage".'));
    }

    if (isNaN(newAmount) || newAmount < 0) {
      return reject(new Error('Invalid price adjustment amount. It should be a non-negative number.'));
    }

    // Update the price adjustment for the specified shop
    const query = `
      UPDATE shop
      SET priceAdjustmentType = ?, priceAdjustmentAmount = ?
      WHERE shopName = ?
    `;
    
    db.run(query, [newType, newAmount, shopName], function(err) {
      if (err) {
        return reject(new Error(`Error updating price adjustment: ${err.message}`));
      }
      
      if (this.changes === 0) {
        return reject(new Error('No shop found with the provided name.'));
      }

      resolve(`Price adjustment updated for shop: ${shopName}`);
    });
  });
};

const getPriceAdjustmentByShopName = async (shopName) => {
  try {
    // Normalize shopName by trimming whitespace and converting to lower case
    const normalizedShopName = shopName.trim().toLowerCase();

    return new Promise((resolve, reject) => {
      // SQL query to retrieve Price and Type based on shopName
      const query = `
        SELECT priceAdjustmentType, priceAdjustmentAmount 
        FROM shop
        WHERE LOWER(ShopName) = ?
      `;

      // Execute the query using the provided db instance
      db.get(query, [normalizedShopName], (err, row) => {
        if (err) {
          console.error('Error executing query:', err);
          reject(new Error('Error fetching price adjustment data.'));
        } else if (row) {
          resolve({ data: row });
        } else {
          resolve({ data: null });  // No data found
        }
      });
    });
  } catch (error) {
    console.error('Error retrieving price adjustment:', error);
    throw new Error('Error fetching price adjustment data.');
  }
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


function updateImportType(shopName, importType, callback) {
  const importTypeValue = JSON.stringify(importType); // Convert importType to JSON string if it's an array

  db.run(`
    UPDATE shop
    SET importType = ?
    WHERE shopName = ?
  `, [importTypeValue, shopName], function(err) {
    if (err) {
      console.error('Error updating importType:', err);
      callback(err, null);
    } else {
      console.log('ImportType updated successfully.');
      callback(null, this.changes);  // `this.changes` will give the number of rows affected
    }
  });
}

function getImportType(shopName, callback) {
  db.get('SELECT importType FROM shop WHERE shopName = ?', [shopName], (err, row) => {
    if (err) {
      console.error('Error fetching importType:', err);
      callback(err, null);
    } else {
      if (row) {
        const importType = row.importType ? JSON.parse(row.importType) : null;  // Parse JSON string if it's stored as JSON
        callback(null, importType);
      } else {
        callback(null, null);  // No shop found
      }
    }
  });
}


const upsertShopSyncSetting = (shopId, syncType, selectedCategories, selectedProductIds) => {
  return new Promise((resolve, reject) => {
    const currentTime = new Date().toISOString();
    console.log('Upserting Shop Sync Setting:', { shopId, syncType, selectedCategories, selectedProductIds });

    // Step 1: Check if the setting exists for the given shop_id
    const checkQuery = `SELECT * FROM shop_sync_settings WHERE shop_id = ?`;
    console.log('Running check query:', checkQuery);

    db.get(checkQuery, [shopId], (err, existingSetting) => {
      if (err) {
        console.error('Error checking existing setting:', err);
        return reject(new Error(`Error checking shop sync setting: ${err.message}`));
      }

      if (existingSetting) {
        // Step 2: If setting exists, update it
        console.log('Found existing setting. Updating...', existingSetting);

        const updateQuery = `
          UPDATE shop_sync_settings
          SET sync_type = ?, 
              selected_categories = ?, 
              selected_product_ids = ?, 
              updated_at = ?
          WHERE shop_id = ?
        `;
        console.log('Running update query:', updateQuery);

        db.run(
          updateQuery,
          [syncType, selectedCategories || null, selectedProductIds || null, currentTime, shopId],
          function (updateErr) {
            if (updateErr) {
              console.error('Error updating shop sync setting:', updateErr);
              return reject(new Error(`Error updating shop sync setting: ${updateErr.message}`));
            }
            console.log('Updated shop sync setting successfully.');
            resolve({ message: 'Updated existing shop sync setting', shopId });
          }
        );
      } else {
        // Step 3: If no setting exists, insert a new one
        console.log('No existing setting found. Inserting new setting.');

        const insertQuery = `
          INSERT INTO shop_sync_settings (shop_id, sync_type, selected_categories, selected_product_ids, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `;
        console.log('Running insert query:', insertQuery);

        db.run(
          insertQuery,
          [
            shopId,
            syncType,
            selectedCategories || null,
            selectedProductIds || null,
            currentTime,
            currentTime,
          ],
          function (insertErr) {
            if (insertErr) {
              console.error('Error inserting shop sync setting:', insertErr);
              return reject(new Error(`Error inserting shop sync setting: ${insertErr.message}`));
            }
            console.log('Inserted new shop sync setting successfully.');
            resolve({ message: 'Added new shop sync setting', shopId });
          }
        );
      }
    });
  });
};


function getShopSyncSetting( shopId) {
  return new Promise((resolve, reject) => {
    // Query to retrieve the sync setting for a given shop_id
    const query = `SELECT * FROM shop_sync_settings WHERE shop_id = ?`;

    db.get(query, [shopId], (err, row) => {
      if (err) {
        return reject(new Error(`Error retrieving shop sync setting: ${err.message}`));
      }

      if (!row) {
        // No setting found for the given shop_id
        return resolve({ message: 'No sync setting found for the given shop_id', shopId });
      }

      // Return the retrieved sync setting
      resolve(row);
    });
  });
}

const getCategories = () => {
  return new Promise((resolve, reject) => {
    const query = `SELECT DISTINCT category FROM products`;
    
    db.all(query, [], (err, rows) => {
      if (err) {
        reject('Failed to fetch categories');
      } else {
        resolve(rows.map(row => row.category));
      }
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
  addOrder,
  saveProductToDB,
  getAllProductsFromDB,
  countProducts,
  updateImportType,
  getImportType,
  upsertShopSyncSetting,
  getShopSyncSetting,
  getCategories,
  getProductsByCategoryFromDB,
  updatePriceAdjustment,
getPriceAdjustmentByShopName,
getProductsByProductIDsFromDB
};
