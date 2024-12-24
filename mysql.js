const mysql = require('mysql2');
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',           // replace with your username
    password: '',           // replace with your password
    database: 'factory_price'        // replace with your database name
  });
  
  // Open the MySQL connection



  db.connect((err) => {
    if (err) {
      console.error('Error connecting to MySQL:', err);
      return;
    }
    console.log('Connected to MySQL database.');
  });

  function query(sql, params) {
    return new Promise((resolve, reject) => {
      db.execute(sql, params, (err, results) => {
        if (err) {
          reject(err); // Reject the promise if there's an error
        } else {
          resolve(results); // Resolve the promise with query results
        }
      });
    });
  }
  
  // Create tables
  const queries = [
    `
    CREATE TABLE IF NOT EXISTS shop (
      id INT AUTO_INCREMENT PRIMARY KEY,
      shopName VARCHAR(255) NOT NULL,
      accessToken VARCHAR(255) NOT NULL,
      priceAdjustmentType ENUM('fixed', 'percentage') NOT NULL DEFAULT 'fixed',
      priceAdjustmentAmount DECIMAL(10, 2) NOT NULL DEFAULT 0,
      currency VARCHAR(10) NOT NULL DEFAULT 'USD',
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(shopName)
    );
    `,
    `
    CREATE TABLE IF NOT EXISTS user_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      level VARCHAR(50) NOT NULL,
      message TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      shop_id VARCHAR(255) NOT NULL,
      sku VARCHAR(255) DEFAULT NULL,
      error_message TEXT DEFAULT NULL
    );
    `,
    `
    CREATE TABLE IF NOT EXISTS shop_details (
      id INT AUTO_INCREMENT PRIMARY KEY,
      shopID VARCHAR(255) NOT NULL,
      apikey VARCHAR(255) NOT NULL,
      apiSecret VARCHAR(255) NOT NULL,
      apiurl VARCHAR(255) NOT NULL,
      syncProducts BOOLEAN DEFAULT FALSE,
      syncOrders BOOLEAN DEFAULT FALSE,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    `,
    `
    CREATE TABLE IF NOT EXISTS shop_sync_settings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      shop_id INT NOT NULL,
      sync_type ENUM('all', 'categories', 'product_ids') NOT NULL,
      selected_categories TEXT,
      selected_product_ids TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (shop_id) REFERENCES shop(id) ON DELETE CASCADE
    );
    `,
    `
    CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      productID VARCHAR(255) NOT NULL UNIQUE,
      ModelID VARCHAR(255),
      model VARCHAR(255),
      color VARCHAR(50),
      gender VARCHAR(50),
      category VARCHAR(255),
      producer VARCHAR(255),
      suggested_price_netto_pln DECIMAL(10, 2),
      wholesale_price_netto_pln DECIMAL(10, 2),
      vat INT,
      photo_link_small TEXT,
      photo_link_large TEXT,
      material_composition TEXT,
      washing_recipe TEXT,
      description TEXT,
      sizechart TEXT,
      variants TEXT,
      pictures TEXT,
      title VARCHAR(255) DEFAULT 'title'
    );
    `,
    `
    CREATE TABLE IF NOT EXISTS orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      shopify_order_no VARCHAR(255) NOT NULL UNIQUE,
      factory_price_order_no VARCHAR(255) NOT NULL UNIQUE,
      cancelled BOOLEAN DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    `,
    `
    CREATE TABLE IF NOT EXISTS shop_api_settings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      shopID VARCHAR(255) NOT NULL,
      apikey VARCHAR(255) NOT NULL,
      apiSecret VARCHAR(255) NOT NULL,
      apiurl VARCHAR(255) NOT NULL,
      syncProducts BOOLEAN DEFAULT FALSE,
      syncOrders BOOLEAN DEFAULT FALSE,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    `
  ];
  
  // Execute each query
  queries.forEach((query, index) => {
    db.query(query, (err, results) => {
      if (err) {
        console.error(`Error creating table at index ${index}:`, err);
      } else {
        console.log(`Table created or already exists at index ${index}.`);
      }
    });
  });



  const upsertShopDetails = async (shopID, apikey, apiSecret, apiurl, syncProducts, syncOrders) => {
    const connection = await mysql.createConnection(dbConfig);
    try {
      await connection.beginTransaction();
  
      // Clean up duplicates
      await connection.execute(`
        DELETE FROM shop_details WHERE id NOT IN (
          SELECT min_id FROM (
            SELECT MIN(id) as min_id FROM shop_details GROUP BY shopID
          ) as subquery
        );
      `);
  
      // Upsert shop details
      const [rows] = await connection.execute('SELECT * FROM shop_details WHERE shopID = ?', [shopID]);
      if (rows.length > 0) {
        await connection.execute(
          `UPDATE shop_details SET apikey = ?, apiSecret = ?, apiurl = ?, syncProducts = ?, syncOrders = ? WHERE shopID = ?`,
          [apikey, apiSecret, apiurl, syncProducts, syncOrders, shopID]
        );
      } else {
        await connection.execute(
          `INSERT INTO shop_details (shopID, apikey, apiSecret, apiurl, syncProducts, syncOrders) VALUES (?, ?, ?, ?, ?, ?)`,
          [shopID, apikey, apiSecret, apiurl, syncProducts, syncOrders]
        );
      }
  
      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      await connection.end();
    }
  };
  
  const saveProductToDB = async (productData) => {
    const connection = await mysql.createConnection(dbConfig);
    try {
      const variants = JSON.stringify(productData.variants || []);
      const pictures = JSON.stringify(productData.pictures || []);
  
      const [result] = await connection.execute(
        `INSERT INTO products (
          productID, ModelID, model, color, gender, category, producer,
          suggested_price_netto_pln, wholesale_price_netto_pln, vat,
          photo_link_small, photo_link_large, material_composition, washing_recipe,
          description, sizechart, variants, pictures, title
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
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
          variants || "some",
          pictures || "Some",
          productData.display_name?._cdata || productData.display_name?._text || productData.display_name || '',
        ]
      );
  
      return result;
    } catch (err) {
      console.error("Error in saveProductToDB:", err);
      throw err;
    } finally {
      await connection.end();
    }
  };
  
  const insertLog = async (level, message, shop_id, sku = null, error_message = null) => {
    const connection = await mysql.createConnection(dbConfig);
    try {
      const timestamp = new Date().toISOString();
      const [result] = await connection.execute(
        `INSERT INTO user_logs (level, message, timestamp, shop_id, sku, error_message) VALUES (?, ?, ?, ?, ?, ?)`,
        [level, message, timestamp, shop_id, sku, error_message]
      );
      console.log('Log entry inserted with ID:', result.insertId);
    } catch (err) {
      console.error('Error inserting log', err);
    } finally {
      await connection.end();
    }
  };
  
  const changeCurrency = async (shopId, newCurrency) => {
    const connection = await mysql.createConnection(dbConfig);
    try {
      const [result] = await connection.execute(
        `UPDATE shop SET currency = ? WHERE shopName = ?`,
        [newCurrency, shopId]
      );
  
      if (result.affectedRows === 0) {
        throw new Error('Shop not found or no changes made.');
      }
  
      console.log('Currency updated successfully.');
    } catch (err) {
      console.error(err);
      throw err;
    } finally {
      await connection.end();
    }
  };
  
  const getLogsByShop = async (shopName, limit = 10) => {
    const connection = await mysql.createConnection(dbConfig);
    try {
      const [rows] = await connection.execute(
        `SELECT * FROM user_logs WHERE shop_id = ? ORDER BY timestamp DESC LIMIT ?`,
        [shopName, limit]
      );
      return rows;
    } catch (err) {
      console.error('Error fetching logs', err);
      throw err;
    } finally {
      await connection.end();
    }
  };
  
  const getCurrencyByShopName = async (shopId) => {
    const connection = await mysql.createConnection(dbConfig);
    try {
      const [rows] = await connection.execute(
        `SELECT currency FROM shop WHERE shopName = ?`,
        [shopId]
      );
  
      if (rows.length === 0) {
        throw new Error('Shop not found.');
      }
  
      return rows[0].currency;
    } catch (err) {
      console.error('Error fetching currency:', err);
      throw err;
    } finally {
      await connection.end();
    }
  };
  
  const deleteLogsByShop = async (shopName) => {
    const connection = await mysql.createConnection(dbConfig);
    try {
      await connection.execute(`DELETE FROM user_logs WHERE shop_id = ?`, [shopName]);
    } catch (err) {
      console.error('Error deleting logs', err);
      throw err;
    } finally {
      await connection.end();
    }
  };
  
  const getAllProductsFromDB = async (limit = 100, offset = 0) => {
    const connection = await mysql.createConnection(dbConfig);
    try {
      const [rows] = await connection.execute(
        `SELECT * FROM products LIMIT ? OFFSET ?`,
        [limit, offset]
      );
      return rows;
    } catch (err) {
      console.error('Error retrieving products from DB', err);
      throw err;
    } finally {
      await connection.end();
    }
  };
  
  const getProductsByCategoryFromDB = async (categories, limit, offset) => {
    try {
      const placeholders = categories.map(() => '?').join(', '); // Create placeholders for categories
      const query = `SELECT * FROM products WHERE category IN (${placeholders}) LIMIT ? OFFSET ?`;
  
      const [rows] = await pool.execute(query, [...categories, limit, offset]);
      return rows; // Return the result (array of products)
    } catch (e) {
      console.error('Error in getProductsByCategoryFromDB:', e);
      return []; // Return an empty array if there's an error
    }
  };
  
  const getProductsByIdsFromDB = async (productIds, limit = 100, offset = 0) => {
    try {
      const placeholders = productIds.map(() => '?').join(', '); // Create placeholders for product IDs
      const query = `SELECT * FROM products WHERE id IN (${placeholders}) LIMIT ? OFFSET ?`;
  
      const [rows] = await pool.execute(query, [...productIds, limit, offset]);
      return rows; // Return the result (array of products)
    } catch (e) {
      console.error('Error in getProductsByIdsFromDB:', e);
      return []; // Return an empty array if there's an error
    }
  };
  
  const getProductsByProductIDsFromDB = async (productIDs) => {
    try {
      const products = [];
  
      await Promise.all(
        productIDs.map(async (productID) => {
          const query = `SELECT * FROM products WHERE id = ?`;
          const [rows] = await pool.execute(query, [productID]);
          if (rows.length > 0) products.push(rows[0]); // Add the product to the array
        })
      );
  
      return products; // Return the array of products
    } catch (e) {
      console.error('Error in getProductsByProductIDsFromDB:', e);
      return []; // Return an empty array if there's an error
    }
  };
  
  const getProductByID = async (productID) => {
    try {
      const query = `SELECT * FROM products WHERE id = ?`;
      const [rows] = await pool.execute(query, [productID]);
  
      return rows.length > 0 ? rows[0] : null; // Return the product or null if not found
    } catch (e) {
      console.error('Error in getProductByID:', e);
      return null; // Return null if there's an error
    }
  };
  
  const countProducts = async () => {
    try {
      const query = `SELECT COUNT(*) AS total FROM products`;
      const [rows] = await pool.execute(query);
  
      return rows[0].total; // Return the total count of products
    } catch (e) {
      console.error('Error in countProducts:', e);
      return 0; // Return 0 if there's an error
    }
  };
  

  const getAllShopDetails = async () => {
    try {
      const rows = await query('SELECT * FROM shop_details', []);
      return rows;
    } catch (error) {
      console.error('Error fetching all shop details:', error);
      throw error;
    }
  };
  
  async function SaveShop(shop, accessToken) {
    try {
      const result = await query(
        `INSERT INTO shop (shopName, accessToken) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE accessToken = VALUES(accessToken)`,
        [shop, accessToken]
      );
      console.log(
        result.affectedRows === 1
          ? `Shop '${shop}' and its accessToken saved to the database.`
          : `Updated access token for shop '${shop}'.`
      );
      return result.affectedRows > 0 ? 1 : 0;
    } catch (error) {
      console.error('Error saving/updating shop token:', error);
      return 0;
    }
  }
  
  async function SaveUserData(shopID, apiKey, apiSecret, apiUrl) {
    try {
      const result = await query(
        `INSERT INTO shop_details (shopID, apiKey, apiSecret, apiUrl)
        VALUES (?, ?, ?, ?)`,
        [shopID, apiKey, apiSecret, apiUrl]
      );
      return {
        id: result.insertId,
        shopID,
        apiKey,
        apiSecret,
        apiUrl,
      };
    } catch (error) {
      console.error('Error saving API settings:', error);
      throw error;
    }
  }
  
  const getShopIDByShopName = async (shopName) => {
    try {
      const rows = await query('SELECT id FROM shop WHERE shopName = ?', [
        shopName,
      ]);
      if (rows.length > 0) {
        console.log('Shop found:', rows[0]);
        return rows[0].id;
      } else {
        console.log('No shop found with name:', shopName);
        throw new Error('Shop not found');
      }
    } catch (error) {
      console.error('Error querying shop table:', error);
      throw error;
    }
  };
  
  const getShopAPIDataByShopID = async (shopID) => {
    try {
      const rows = await query(
        `SELECT * FROM shop_details WHERE shopID = ?`,
        [shopID]
      );
      if (rows.length > 0) {
        console.log('Shop data found:', rows);
        return rows;
      } else {
        console.log('No data found for shopID:', shopID);
        throw new Error('No data found for this shopID');
      }
    } catch (error) {
      console.error('Error querying shop_details table:', error);
      throw error;
    }
  };
  
  const updatePriceAdjustment = async (shopName, newType, newAmount) => {
    try {
      if (newType !== 'fixed' && newType !== 'percentage') {
        throw new Error(
          'Invalid price adjustment type. It should be either "fixed" or "percentage".'
        );
      }
  
      if (isNaN(newAmount) || newAmount < 0) {
        throw new Error(
          'Invalid price adjustment amount. It should be a non-negative number.'
        );
      }
  
      const result = await query(
        `UPDATE shop
        SET priceAdjustmentType = ?, priceAdjustmentAmount = ?
        WHERE shopName = ?`,
        [newType, newAmount, shopName]
      );
  
      if (result.affectedRows === 0) {
        throw new Error('No shop found with the provided name.');
      }
  
      return `Price adjustment updated for shop: ${shopName}`;
    } catch (error) {
      console.error('Error updating price adjustment:', error);
      throw error;
    }
  };
  
  const getPriceAdjustmentByShopName = async (shopName) => {
    try {
      const normalizedShopName = shopName.trim().toLowerCase();
  
      const rows = await query(
        `SELECT priceAdjustmentType, priceAdjustmentAmount
        FROM shop
        WHERE LOWER(shopName) = ?`,
        [normalizedShopName]
      );
  
      if (rows.length > 0) {
        return { data: rows[0] };
      } else {
        return { data: null };
      }
    } catch (error) {
      console.error('Error retrieving price adjustment:', error);
      throw error;
    }
  };
  
  const addOrder = async (shopifyOrderNo, factoryPriceOrderNo, cancelled = 0) => {
    try {
      const result = await query(
        `INSERT INTO orders (shopify_order_no, factory_price_order_no, cancelled)
        VALUES (?, ?, ?)`,
        [shopifyOrderNo, factoryPriceOrderNo, cancelled]
      );
  
      console.log(
        `Order added with Shopify Order No: ${shopifyOrderNo} and Factory Price Order No: ${factoryPriceOrderNo}`
      );
      return result.insertId;
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new Error(
          `Order with Shopify Order No: ${shopifyOrderNo} or Factory Price Order No: ${factoryPriceOrderNo} already exists.`
        );
      } else {
        console.error('Error adding order:', error);
        throw error;
      }
    }
  };
  
  const updateOrderCancellationStatus = async (shopifyOrderNo, cancelled) => {
    try {
      const result = await query(
        `UPDATE orders SET cancelled = ? WHERE shopify_order_no = ?`,
        [cancelled, shopifyOrderNo]
      );
  
      return `Order with Shopify Order No: ${shopifyOrderNo} updated.`;
    } catch (error) {
      console.error('Error updating order cancellation status:', error);
      throw error;
    }
  };
  
  const deleteShopAPIData = async (id) => {
    try {
      const result = await query(
        `DELETE FROM shop_details WHERE id = ?`,
        [id]
      );
  
      if (result.affectedRows === 0) {
        throw new Error('No API data found with the provided id.');
      }
  
      console.log(`Successfully deleted API data with id: ${id}`);
      return { message: `API data with id ${id} deleted successfully` };
    } catch (error) {
      console.error('Error deleting API data:', error);
      throw error;
    }
  };
  
  async function getAllShops() {
    try {
      const rows = await query('SELECT shopName, accessToken FROM shop', []);
      console.log('Shops:', rows);
      return rows;
    } catch (error) {
      console.error('Error fetching shops:', error);
      throw error;
    }
  }
  
  const getCategories = async () => {
    try {
      const rows = await query(`SELECT DISTINCT category FROM products`, []);
      return rows.map((row) => row.category);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
      throw error;
    }
  };
  const updateImportType = async (shopName, importType) => {
    try {
      const importTypeValue = JSON.stringify(importType); // Convert importType to JSON string if it's an array
  
      const result = await query(
        `
        UPDATE shop
        SET importType = ?
        WHERE shopName = ?
        `,
        [importTypeValue, shopName]
      );
  
      if (result.affectedRows > 0) {
        console.log('ImportType updated successfully.');
        return { message: 'ImportType updated successfully.', changes: result.affectedRows };
      } else {
        console.log('No shop found with the provided name.');
        throw new Error('No shop found with the provided name.');
      }
    } catch (error) {
      console.error('Error updating importType:', error);
      throw error;
    }
  };
  function getImportType(shopName, callback) {
    const query = 'SELECT importType FROM shop WHERE shopName = ?';
    
    connection.execute(query, [shopName], (err, results) => {
      if (err) {
        console.error('Error fetching importType:', err);
        callback(err, null);
      } else {
        if (results.length > 0) {
          const importType = results[0].importType ? JSON.parse(results[0].importType) : null;
          callback(null, importType);
        } else {
          callback(null, null); // No shop found
        }
      }
    });
  }

  function getShopSyncSetting(shopId) {
    return new Promise((resolve, reject) => {
      // Query to retrieve the sync setting for a given shop_id
      const query = `SELECT * FROM shop_sync_settings WHERE shop_id = ?`;
  
      connection.execute(query, [shopId], (err, results) => {
        if (err) {
          return reject(new Error(`Error retrieving shop sync setting: ${err.message}`));
        }
  
        if (results.length === 0) {
          // No setting found for the given shop_id
          return resolve({ message: 'No sync setting found for the given shop_id', shopId });
        }
  
        // Return the retrieved sync setting
        resolve(results[0]);
      });
    });
  }
  const upsertShopSyncSetting = (shopId, syncType, selectedCategories, selectedProductIds) => {
    return new Promise((resolve, reject) => {
      const currentTime = new Date().toISOString();
      console.log('Upserting Shop Sync Setting:', { shopId, syncType, selectedCategories, selectedProductIds });
  
      // Step 1: Check if the setting exists for the given shop_id
      const checkQuery = `SELECT * FROM shop_sync_settings WHERE shop_id = ?`;
      console.log('Running check query:', checkQuery);
  
      connection.execute(checkQuery, [shopId], (err, results) => {
        if (err) {
          console.error('Error checking existing setting:', err);
          return reject(new Error(`Error checking shop sync setting: ${err.message}`));
        }
  
        if (results.length > 0) {
          // Step 2: If setting exists, update it
          console.log('Found existing setting. Updating...', results[0]);
  
          const updateQuery = `
            UPDATE shop_sync_settings
            SET sync_type = ?, 
                selected_categories = ?, 
                selected_product_ids = ?, 
                updated_at = ?
            WHERE shop_id = ?
          `;
          console.log('Running update query:', updateQuery);
  
          connection.execute(
            updateQuery,
            [syncType, selectedCategories || null, selectedProductIds || null, currentTime, shopId],
            (updateErr) => {
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
  
          connection.execute(
            insertQuery,
            [
              shopId,
              syncType,
              selectedCategories || null,
              selectedProductIds || null,
              currentTime,
              currentTime,
            ],
            (insertErr) => {
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
  getProductsByProductIDsFromDB,
  getAllShops,
  insertLog,
  getLogsByShop,
  deleteLogsByShop,
  changeCurrency,
  getCurrencyByShopName,
  getProductByID
  };