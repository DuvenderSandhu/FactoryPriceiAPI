require('isomorphic-fetch');
const express = require('express');
const bodyParser = require('koa-bodyparser');
const dotenv = require('dotenv');
const {koaBody}  = require('koa-body');
const Koa = require('koa');
const next = require('next');
const fs = require('fs').promises;
const { promisify } = require('util');
const cron = require('node-cron');
const { XMLParser  } = require('fast-xml-parser')
const axios= require('axios')
const { default: createShopifyAuth } = require('@shopify/koa-shopify-auth');
const { verifyRequest } = require('@shopify/koa-shopify-auth');
const session = require('koa-session');
const { upsertShopDetails } = require('./db'); 
dotenv.config();
const { default: graphQLProxy } = require('@shopify/koa-shopify-graphql-proxy');
const Router = require('koa-router');
const { receiveWebhook, registerWebhook } = require('@shopify/koa-shopify-webhooks');
const { ApiVersion } = require('@shopify/koa-shopify-graphql-proxy');
const getSubscriptionUrl = require('./server/getSubscriptionUrl');
const db = require('./db'); // Import the SQLite connection
const { route } = require('next/dist/server/router');
const { message } = require('antd');
const { xml2js } = require('xml-js');
const path = require('path');
const winston = require('winston');
const port = parseInt(process.env.PORT, 10) || 3000;
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const { SHOPIFY_API_SECRET_KEY, SHOPIFY_API_KEY, HOST } = process.env;

// Create a new table for storing shop details (shopName and accessToken)
const parser= new XMLParser()
const logFilePath = path.join(__dirname, 'syncShopifyLog.txt');
const logger = winston.createLogger({
  level: 'info',
  transports: [
    new winston.transports.File({ filename: 'sync-log.txt' }),  // Log to file
    new winston.transports.Console(),  // Log to console as well
  ],
});

const  logAction = (message) => {
  logger.info(message);  // Log to file and console
};

app.prepare().then(() => {
  const server = new Koa();
  const router = new Router();
  // server.use(bodyParser({ enableTypes: ['json'] }));
  
  server.use(session({ secure: true, sameSite: 'none' }, server));
  server.keys = [SHOPIFY_API_SECRET_KEY];

  server.use(
    createShopifyAuth({
      apiKey: SHOPIFY_API_KEY,
      secret: SHOPIFY_API_SECRET_KEY,
      scopes: ['read_products', 'write_products','write_inventory','read_inventory','read_orders', 'write_orders','read_customers','write_customers'],
      async afterAuth(ctx) {
        const { shop, accessToken } = ctx.session;
        console.log(shop)
        console.log(accessToken)
        
        await db.SaveShop(shop,accessToken)
        let shopID= await db.getShopIDByShopName(shop)
        // Save the shop and accessToken into the database (we'll upsert the shop)
        try {
          await upsertShopDetails(shopID, '', '', true, true, accessToken, (err, shopDetails) => {
            if (err) {
              console.error('Error saving shop details:', err);
            } else {
              console.log(`Shop details saved for shop: ${shop}`);
            }
          });
        } catch (error) {
          console.error('Error during authentication:', error);
        }
        // Set shopOrigin cookie for future requests
        ctx.cookies.set('shopOrigin', shop, {
          httpOnly: false,
          secure: true,
          sameSite: 'none'
        });

        // Register webhook for products/create
        const productRegistration = await registerWebhook({
          address: `${HOST}/webhooks/products/create`,
          topic: 'PRODUCTS_CREATE',
          accessToken,
          shop,
          apiVersion: ApiVersion.October19
        });
        
        if (productRegistration.success ) {
          console.log('Successfully registered webhooks for products/create and orders/create!');
        } else {
          console.log('Failed to register webhooks');
        }
        

        // Handle subscription URL (this part might be optional depending on your needs)
        await getSubscriptionUrl(ctx, accessToken, shop);
      },
    }),
  );

  const webhook = receiveWebhook({ secret: SHOPIFY_API_SECRET_KEY });
  // const orderWebhook = receiveWebhook({ secret: SHOPIFY_API_SECRET_KEY });
  // Handle incoming webhooks
  const rawBodyParser = async (ctx, next) => {
    ctx.request.rawBody = await new Promise((resolve, reject) => {
      let data = '';
      ctx.req.on('data', (chunk) => {
        data += chunk;
      });
      ctx.req.on('end', () => {
        resolve(data);
      });
      ctx.req.on('error', reject);
    });
    await next();
  };
  
  router.post('/webhooks/products/create', rawBodyParser, webhook, (ctx) => {
    console.log('Received webhook:', ctx.state.webhook);
  });
  

  server.use(koaBody({
    multipart: true,  // Enable multipart parsing (for file uploads)
    json: true,       // Enable JSON body parsing
    urlencoded: true, // Enable urlencoded body parsing (if you need it)
    rawBody: false,   // Disable raw body parsing (useful for webhooks if needed)
    formidable: {
      uploadDir: path.join(__dirname, 'uploads'),  // Directory to save uploaded files
      keepExtensions: true,  // Keep file extensions
      maxFileSize: 100 * 1024 * 1024,  // Set max file size (100MB in this case)
    },
  }));
  router.post('/api/upload', async (ctx) => {
    const { files } = ctx.request;
  
    if (!files || !files.file) {
      ctx.status = 400;
      ctx.body = { error: 'No file uploaded' };
      return;
    }
  
    const uploadedFile = files.file;
    const oldFilePath = uploadedFile.filepath;  // Temporary path where the file is saved
    const newFileName = ctx.session.shop + path.extname(uploadedFile.originalFilename);  // Use original file extension
    const newFilePath = path.join(__dirname, 'uploads', newFileName);  // New file path with the desired name
  
    try {
      // Use fs.rename() to rename the file
      fs.rename(oldFilePath, newFilePath, (err) => {
        if (err) {
          ctx.status = 500;
          ctx.body = { error: 'Error renaming or processing the file' };
          console.error('Error renaming file:', err);
          return;
        }
  
        console.log('File renamed and saved to:', newFilePath);
  
        // Respond to the client
        ctx.body = {
          ok:true,
          status:200,
          message: 'File uploaded and renamed successfully',
          file: {
            originalFileName: uploadedFile.originalFilename,
            newFileName: newFileName,
            path: newFilePath,
          },
        };
      });
    } catch (error) {
      ok:false,
      ctx.status = 500;
      ctx.body = { error: 'Error processing the file' };
      console.error('Error:', error);
    }
  });


  router.post('/webhooks/orders/create', (ctx) => {
    console.log('Received new order webhook:', ctx.state.webhook);

    const order = ctx.state.webhook;
    console.log('New Order Details:', order);
    console.log('Order ID:', order.id);
    console.log('Customer Info:', order.customer);
    console.log('Order Total:', order.total_price);
  });

  // Optional: a test route
  router.post('/abc', (ctx) => {
    console.log("Webhook hit at /abc route");
    console.log("Request body:", ctx.request.body);  // Log the request body to see the webhook data

    // Your existing code
    ctx.body = { 
        message: 'How are you?', 
        status: 'success', 
        shopName: ctx.session.shop, 
        token: ctx.session.accessToken 
    };
    ctx.type = 'application/json'; // Ensure the response is treated as JSON
});
//TODO:// Unsupported XML Scheme please correct the fields
router.post('/createOrder', async (ctx) => {
  const order = ctx.request.body;
  console.log("Order received:", order);

  // Define the XML structure for the order request
  const xmlData = `<OrderXml>
    <docXml>
      <orders>
        <order>
          <header>
            <number>${order.order_number || ''}</number>
            <order_date>${new Date(order.created_at).toISOString().split('T')[0]}</order_date>
            <order_status>${order.fulfillment_status || 'pending'}</order_status>
            <order_type>B2B</order_type>
            <order_amount>${order.current_total_price}</order_amount>
            <client_ID>${order.customer.id}</client_ID>
            <comments>Order placed by ${order.email}</comments>
            <dispatch_Firstname>${order.shipping_address.first_name || ''}</dispatch_Firstname>
            <dispatch_Lastname>${order.shipping_address.last_name || ''}</dispatch_Lastname>
            <dispatch_Country>${order.shipping_address.country || ''}</dispatch_Country>
            <dispatch_City>${order.shipping_address.city || ''}</dispatch_City>
            <dispatch_Postcode>${order.shipping_address.zip || ''}</dispatch_Postcode>
            <dispatch_Street>${order.shipping_address.address1 || ''}</dispatch_Street>
            <dispatch_Number>${order.shipping_address.address2 || ''}</dispatch_Number>
            <dispatch_Phone>${order.shipping_address.phone || '88932843749'}</dispatch_Phone>
            <delivery_by>w</delivery_by>
            <delivery_label_url></delivery_label_url>
            <payment_type>${order.payment_gateway_names.join(', ') || 'prepaid'}</payment_type>
            <delivery_method>UPS</delivery_method>
            <codeDiscount>${order.total_discounts || ''}</codeDiscount>
          </header>
          <products>
            ${order.line_items.map(item => `
              <product productcode="${item.sku}" qty="${item.quantity}"></product>
            `).join('')}
          </products>
        </order>
      </orders>
    </docXml>
  </OrderXml>`;
  const queryParams = new URLSearchParams({
    username: "info@aboutstyle.lt", // Replace with the actual username
    salt: "ABC707B5-3720"      // Replace with the actual password
  }).toString();

  const finalUrl = `https://api.factoryprice.eu/orders?${queryParams}`; // Append query parameters to the URL
  
  // Prepare data in x-www-form-urlencoded format
  const formData = new URLSearchParams();
  formData.append('docXml', xmlData); // Append XML data to docXml field



  try {
    const response = await fetch(finalUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded', // Correct content-type for URL encoding
      },
      body: formData, // Send the form data as the body
    });

    // Read the response as text
    const responseInfo = await response.text();

    const jsonObj = parser.parse(responseInfo);
    
    // Extract the order_number from the parsed object
    const orderNumber = jsonObj.response.order_number;
    
    // Log the order number or use it as needed
    console.log('Order Number:', orderNumber);
    console.log(orderNumber)
    if(orderNumber==undefined){
      ctx.body={
        success:false,
        status:500,
        message:"Order Couldn't completed due to server processing ",
        data:{}
      }
    }
    // Log the order number or use it as needed
    console.log('Order Number:', orderNumber);
    console.log("Order Number Factory",orderNumber)
    console.log("Order Number Shopify",order.order_number)
    await db.addOrder(order.order_number,orderNumber)
    ctx.body={
      success:true,
      status:200,
      message:"Order Created",
      data:{}
    }
  } catch (error) {
    console.error("Error sending request:", error);
    ctx.body={
      success:false,
      status:500,
      message:"Order Couldn't completed due to server processing ",
      data:{}
    }
  }
});


router.get('/getOrder', async (ctx) => {
  let username="info@aboutstyle.lt";
  let password= "ABC707B5-3720"

  const url = `https://api.factoryprice.eu/orders/${ ctx.query.orderNumber}?username=${username}&salt=${password}`;

  try {
    // Send GET request using axios
    const response = await axios.get(url, {
      headers: {
        'Content-Type': 'application/xml',
      },
    });

    // Parse XML response
    // const parser = new xml2js.Parser();
    parser.parseString(response.data, (err, result) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to parse XML response' });
      }

      // Extract order_number from the parsed response
      const orderNumber = result.response.order[0].order_number[0];
      const orderStatus = result.response.order[0].status[0];

      // Send back the order_number as a response
      res.json({
        success: true,
        order_number: orderNumber,
        status: orderStatus,
      });
    });

  } catch (error) {
    console.error('Error fetching order data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.put('/api/update-price-adjustment', async (ctx) => {
  const { priceAdjustmentType, priceAdjustmentAmount } = ctx.request.body;  // Get query parameters
  console.log(priceAdjustmentType,priceAdjustmentType)
  // Validate input
  if (!priceAdjustmentType || !priceAdjustmentAmount) {
    ctx.status = 400;
    ctx.body = { error: 'priceAdjustmentType and priceAdjustmentAmount are required' };
    return;
  }

  try {
    const result = await db.updatePriceAdjustment(ctx.session.shop, priceAdjustmentType, priceAdjustmentAmount);
    ctx.status = 200;
    ctx.body = { message: result };
  } catch (err) {
    ctx.status = 500;
    ctx.body = { error: err.message || err };
  }
});



// Cancel Order 
router.post('/deleteOrder', async (ctx) => {
  let username="info@aboutstyle.lt";
  let salt= "ABC707B5-3720"
  console.log("Body",ctx.request.body)
  const orderId = ctx.request.body.id; // Example order number to delete
  console.log(orderId)
  // Construct the URL with the query parameters
  const url = `https://api.factoryprice.eu/orders/${orderId}?username=${username}&salt=${salt}`;

  try {
    // Send DELETE request using axios
      // Send DELETE request
      const response = await fetch(url, {
        method: 'DELETE', // Specify the HTTP method as DELETE
        headers: {
          'Content-Type': 'application/json', // Set appropriate headers if necessary
          // Add any other headers if needed (e.g., Authorization)
        }
      });
  
      // Check if the response is successful (status 200-299)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
  
      // Read the response body as text
      const responseInfo = await response.text();
      
      // Log or process the response
      console.log('Response Info:', responseInfo);
      await db.updateOrderCancellationStatus(orderId,1)

      ctx.body=({
        success: true,
        message: 'Order Cancellation  successfully Started',
        data: response.data, // You can choose to send this data or not
      });
      return responseInfo; // You can return or use the response as needed
    } catch (error) {
      console.error('Error deleting order:', error);
    // Handle error response from external API
    ctx.body= ({
      success: false,
      error: 'Internal server error while deleting order',
      details: error.response ? error.response.data : error.message, // Capture the error message or data
    })
  }
    // If response is successful, send back response data
    

  
});


  // Save settings route
  router.post('/api/saveSettings', async (ctx) => {
    const { shopName, username, password, syncProducts, syncOrders } = ctx.request.body;

    try {
      // Upsert shop details into the database (this will handle both insert and update)
      console.log('Saving settings for shop:', shopName);
      upsertShopDetails(shopName, username, password, syncProducts, syncOrders, (err, shopDetails) => {
        if (err) {
          console.log('Error saving settings:', err);
          ctx.status = 500;
          ctx.body = { message: 'Error saving settings', error: err.message };
        } else {
          console.log('Settings saved:', shopDetails);
          ctx.status = 200;
          ctx.body = { message: 'Settings saved successfully', data: shopDetails };
        }
      });
    } catch (error) {
      console.error('Unexpected error:', error);
      ctx.status = 500;
      ctx.body = { message: 'Error saving settings', error: error.message };
    }
  });

// Register API settings route
router.post('/register', async (ctx) => {
  const { apiKey, apiSecret, apiUrl } = ctx.request.body;
  console.log(ctx.request.body);

  // Validate required fields
  if (!apiKey || !apiSecret || !apiUrl) {
    ctx.status = 400;
    ctx.body = { message: 'Missing required fields' };
    return;
  }

  try {
    // Fetch shopID by shopName - Wrap in Promise
    const shopID = await new Promise((resolve, reject) => {
      db.getShopIDByShopName(ctx.session.shop, (err, shopID) => {
        if (err) {
          console.log(err);
          reject(new Error('Shop not found in database'));
        } else {
          console.log(shopID)
          resolve(shopID);
        }
      });
    });

    if (!shopID) {
      ctx.status = 404;
      ctx.body = { message: 'Shop not found in database' };
      return;
    }

    // Proceed with saving user data using the retrieved shopID
    try {
      console.log("Hi i am here")
      const result = await db.SaveUserData(shopID, apiKey, apiSecret, apiUrl);
      ctx.status = 201;
      ctx.body = { message: 'API settings registered successfully', result };
    } catch (error) {
      ctx.status = 500;
      ctx.body = { message: error.message || 'Failed to save API settings' };
    }

  } catch (error) {
    // Catch errors from the first Promise (db.getShopIDByShopName)
    ctx.status = 500;
    ctx.body = { message: error.message || 'Unexpected error occurred' };
  }
});



router.delete('/api/deleteAPI', async (ctx) => {
  const { apiId } = ctx.request.body;

  if (!apiId) {
    ctx.status = 400;
    ctx.body = { message: 'API ID is required' };
    return;
  }

  try {
    // Fetch shop ID based on session shop name (wrap in Promise)
    const shopID = await new Promise((resolve, reject) => {
      db.getShopIDByShopName(ctx.session.shop, (err, shopID) => {
        if (err) {
          console.error('Error fetching shop ID:', err);
          reject(new Error('Shop not found in database'));
        } else {
          resolve(shopID);
        }
      });
    });

    if (!shopID) {
      ctx.status = 404;
      ctx.body = { message: 'Shop not found' };
      return;
    }

    // Now delete the API data from the database
    const result = await db.deleteShopAPIData(apiId);

    ctx.status = 200;
    ctx.body = result; // The success message from deleteShopAPIData

  } catch (error) {
    console.error('Error in delete API route:', error);
    ctx.status = 500;
    ctx.body = { message: error.message || 'An error occurred while deleting the API' };
  }
});
// Route to create a product
// Route to create a product



router.get('/shop/change/currency', async (ctx) => {
  const { shop } = ctx.session; // Get the shop ID from the session
  const { currency } = ctx.query; // Get the currency from the query string
  
  if (!currency) {
    ctx.status = 400;
    ctx.body = { error: 'Currency is required' };
    return;
  }

  try {
    const message = await db.changeCurrency(shop, currency);
    ctx.status = 200;
    ctx.body = { message };
  } catch (error) {
    console.log(error)
    ctx.status = 500;
    ctx.body = { error: error.message || 'An error occurred' };
  }
});


// const axios = require('axios'); // To make HTTP requests to Shopify API

// Add the create product route
router.post('/logs', async (ctx) => {
  const { level, message, shop_id, sku, error_message } = ctx.request.body;

  // Input validation
  if (!level || !message || !shop_id) {
    ctx.status = 400;
    ctx.body = { error: 'Missing required fields: level, message, or shop_id.' };
    return;
  }

  try {
    const logId = await db.insertLog(level, message, shop_id, sku, error_message);
    ctx.status = 201;
    ctx.body = { id: logId, message: 'Log inserted successfully' };
  } catch (error) {
    ctx.status = 500;
    ctx.body = { error: 'Failed to insert log.' };
  }
});

router.delete('/logs/:shop_id', async (ctx) => {
  const shop_id = ctx.params.shop_id;

  try {
    const changes = await db.deleteLogsByShopId(shop_id);
    if (changes > 0) {
      ctx.status = 200;
      ctx.body = { message: 'Logs deleted successfully.' };
    } else {
      ctx.status = 404;
      ctx.body = { message: 'No logs found for this shop_id.' };
    }
  } catch (error) {
    ctx.status = 500;
    ctx.body = { error: 'Failed to delete logs.' };
  }
});
router.get('/api/create/products', async (ctx) => {
  try {
    // Get the shop settings from the database
    const shopName = ctx.session.shop;
    const accessToken = ctx.session.accessToken;
    
    if (!shopName || !accessToken) {
      ctx.status = 400;
      ctx.body = { error: 'Shop URL or Access Token missing in session' };
      return;
    }

    const shopID = await new Promise((resolve, reject) => {
      db.getShopIDByShopName(shopName, (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });

    if (!shopID) {
      ctx.status = 404;
      ctx.body = { error: 'Shop ID not found' };
      return;
    }

    // Get shop sync settings
    const syncSettings = await db.getShopSyncSetting(shopID);
    if (!syncSettings) {
      ctx.status = 404;
      ctx.body = { error: 'Sync settings not found for the shop' };
      return;
    }

    const { sync_type, selected_categories, selected_product_ids } = syncSettings;
    const selectedCategories = selected_categories ? selected_categories.split(',') : [];
    const selectedProductIds = selected_product_ids ? selected_product_ids.split(',') : [];

    // Call RunMe with the retrieved settings
    const result = await RunMe(shopName, accessToken, sync_type, selectedCategories, selectedProductIds);

    // Respond with the result of the sync
    ctx.body = result;
  } catch (error) {
    console.error('Error syncing products:', error);
    ctx.status = 500;
    ctx.body = { error: 'Error syncing products' };
  }
});



// Add a route for syncing products
async function axiosWithRetry(config, retries = 1, retryDelay = 1000) {
  try {
    const response = await axios(config);
    return response;
  } catch (error) {
    if (error.response && error.response.status === 429 && retries > 0) {
      // Rate limit exceeded, check the "Retry-After" header for the wait time
      const retryAfter = error.response.headers['retry-after']
                         ? parseInt(error.response.headers['retry-after']) * 1000  // Retry-After is in seconds
                         : retryDelay;  // Default retry delay in milliseconds

      console.log(`Rate limit exceeded. Retrying after ${retryAfter / 1000} seconds...`);

      // Wait for the retry period before retrying
      await new Promise(resolve => setTimeout(resolve, retryAfter));

      // Retry the request with exponential backoff
      return axiosWithRetry(config, retries - 1, retryDelay * 2);  // Exponentially increase the delay
    } else {
      // If it's not a 429 error, or no retries left, rethrow the error
      throw error;
    }
  }
}



router.get('/api/update-sync-settings', async (ctx) => {
  const shopName = ctx.session.shop; // Get the shop name from the session
  const { syncType, selectedCategories, selectedProductIds } = ctx.query; // Retrieve query parameters

  // Validate the input data
  if (!shopName || !syncType) {
    ctx.status = 400; // Bad Request
    ctx.body = { message: 'syncType, selectedCategories, and selectedProductIds are required' };
    return;
  }

  // Fetch the shop ID from the database
  let shopID;
  try {
    shopID = await new Promise((resolve, reject) => {
      db.getShopIDByShopName(shopName, (err, shopID) => {
        if (err) {
          console.error('Error fetching shopID:', err);
          reject(new Error('Error fetching shop ID'));
        }
        resolve(shopID);
      });
    });
  } catch (error) {
    ctx.status = 500; // Internal Server Error
    ctx.body = { message: 'Error fetching shop ID', error: error.message };
    return;
  }

  if (!shopID) {
    ctx.status = 404; // Not Found
    ctx.body = { message: 'Shop ID not found for the given shop name' };
    return;
  }

  // Update the sync settings in the database
  try {
    const changes = await new Promise((resolve, reject) => {
      db.upsertShopSyncSetting(shopID, syncType, selectedCategories, selectedProductIds, (err, changes) => {
        if (err) {
          reject(new Error('Error updating sync settings: ' + err.message));
        }
        resolve(changes);
      });
    });

    if (changes === 0) {
      ctx.status = 404; // Not Found
      ctx.body = { message: 'Shop not found or no changes made.' };
    } else {
      ctx.status = 200; // OK
      ctx.body = { message: 'Sync settings updated successfully' };
    }
  } catch (error) {
    console.error('Error during sync settings update:', error);
    ctx.status = 500; // Internal Server Error
    ctx.body = { message: 'Error updating sync settings', error: error.message };
  }
});



// Route to get the importType
router.get('/api/get-sync-settings', async (ctx) => {
  const shopName= ctx.session.shop

   try {
    const shopID = await new Promise((resolve, reject) => {
       db.getShopIDByShopName(shopName, (err, shopID) => {
         if (err) {
           console.error('Error fetching shopID:', err);
           reject(new Error('Error fetching shop ID'));
         }
         resolve(shopID);
       });
     });
 
     if (!shopID) {
       ctx.status = 404;
       ctx.body = { message: 'Shop ID not found for the given shop name' };
       return;
     }
 
   let data= await db.getShopSyncSetting(shopID)
   ctx.body= data
   } catch (error) {
    console.log(error)
    ctx.body= {error:"Something Went Wrong "}
   }

  });


router.get('/api/syncStock', async (ctx) => {
  const shopName = ctx.session.shop;
  const accessToken = ctx.session.accessToken;

  if (!shopName || !accessToken) {
    ctx.status = 400;
    ctx.body = { message: 'Shop name and access token are required.' };
    return;
  }

  try {
    // Step 1: Fetch all products from Shopify
    const productsAPIUrl = `https://${shopName}/admin/api/2023-10/products.json`;  // Adjust API version if necessary
    const productResponse = await axiosWithRetry({
      url: productsAPIUrl,
      headers: { 'X-Shopify-Access-Token': accessToken },
    });

    const products = productResponse.data.products;
    console.log('Fetched Products:', products);

    // Step 2: Collect all EANs from products
    const inventoryUpdates = [];
    for (let product of products) {
      const ean = product.variants[0]?.sku; // Assuming the barcode is the EAN
      if (!ean) {
        console.log(`EAN not found for product ${product.id}`);
        continue;  // Skip if no EAN is found
      }

      // Step 3: Fetch stock data for each EAN from the external stock API
      const stockAPIUrl = `https://api.factoryprice.eu/stocks/${ean}?username=info@aboutstyle.lt&salt=ABC707B5-3720`;  // Replace with actual stock API URL
      const stockResponse = await axiosWithRetry({
        url: stockAPIUrl,
        headers: { 'X-Shopify-Access-Token': accessToken },
        responseType: 'text', // Expecting XML response
      });

      const parser = new XMLParser();
      const stockData = parser.parse(stockResponse.data);
      console.log('Parsed Stock Data for EAN', ean, stockData);

      if (stockData && stockData.response && stockData.response.stock) {
        const stockItem = stockData.response.stock;
        const stockAvailable = parseFloat(stockItem.stock_available ||0);

        if (isNaN(stockAvailable)) {
          console.error(`Invalid stock value for EAN ${ean}: ${stockItem.stock_available}`);
          continue;  // Skip if stock data is invalid
        }

        // Step 4: Get location IDs from Shopify
        const locationIds = await getLocationIds(shopName, accessToken);
        const locationId = locationIds[0]?.id; // Assume first location for simplicity

        if (!locationId) {
          console.error(`Location ID not found for shop ${shopName}`);
          continue;  // Skip if no location ID is found
        }

        // Step 5: Get inventory item ID by EAN
        const inventoryItemId = await getInventoryItemIdByEAN(shopName, accessToken, ean);
        if (!inventoryItemId) {
          console.error(`Inventory item for EAN ${ean} not found.`);
          continue;  // Skip if inventory item ID is not found
        }

        // Step 6: Update stock in Shopify
        try {
          const updateResponse = await axiosWithRetry({
            method: 'POST',
            url: `https://${shopName}/admin/api/2023-10/inventory_levels/set.json`,
            data: {
              inventory_item_id: inventoryItemId,
              location_id: locationId,
              available: stockAvailable,
            },
            headers: {
              'X-Shopify-Access-Token': accessToken,
              'Content-Type': 'application/json',
            },
          });

          console.log(`Updated inventory for EAN ${ean}:`, updateResponse.data);
          inventoryUpdates.push(updateResponse.data);  // Store the result
        } catch (error) {
          console.error(`Error updating inventory for EAN ${ean}:`, error);
        }
      } else {
        console.log(`No stock data found for EAN ${ean}`);
      }

      // Add a delay between requests to avoid hitting rate limits
      await new Promise(resolve => setTimeout(resolve, 500));  // 500 ms delay
    }

    // Step 7: Respond with the results
    ctx.status = 200;
    ctx.body = { message: 'Stock synced successfully', results: inventoryUpdates };

  } catch (error) {
    console.error('Error syncing stock:', error);
    ctx.status = 500;
    ctx.body = { message: 'Error syncing stock', error: error.message };
  }
});








async function getInventoryItemIdByEAN(shopName, accessToken, ean, retries = 3, retryDelay = 1000) {
  try {
    let inventoryItemId = null;
    let pageInfo = null; // Start with no page info (first page)
    const limit = 250;

    while (!inventoryItemId) {
      // Construct the product search URL with cursor-based pagination
      let productSearchUrl = `https://${shopName}/admin/api/2023-10/products.json`;
      if (pageInfo) {
        productSearchUrl += `&page_info=${pageInfo}`; // Add page_info for pagination if available
      }

      try {
        const response = await axios.get(productSearchUrl, {
          headers: {
            'X-Shopify-Access-Token': accessToken,
          },
        });

        if (response.status !== 200) {
          throw new Error(`Failed to fetch products, status code: ${response.status}`);
        }

        // console.log("Product Here1",response.data.products[0])

        // Check if the EAN is found in any variant
        for (const product of response.data.products) {
          for (const variant of product.variants) {
            if (variant.sku == ean) {
              inventoryItemId = variant.inventory_item_id;
              console.log(`Found inventory item for EAN ${ean}: ${inventoryItemId}`);
              break;
            }
          }
          if (inventoryItemId) break;
        }

        // If inventory item is not found and the response has a 'next' page, move to next page
        if (!inventoryItemId && response.data.products.length === limit) {
          // Set the page_info for the next page if present
          pageInfo = response.headers['link'] && response.headers['link'].includes('rel="next"')
            ? new URLSearchParams(response.headers['link'].split(';')[0]).get('page_info')
            : null;
        } else {
          break;  // Exit the loop if no more pages or item found
        }
      } catch (error) {
        if (error.response && error.response.status === 429 && retries > 0) {
          // Handle rate-limited (429) response
          const retryAfter = error.response.headers['retry-after']
            ? parseInt(error.response.headers['retry-after']) * 1000  // Retry-After is in seconds
            : retryDelay;  // Default retry delay in milliseconds

          console.log(`Rate limit exceeded for fetching inventory item by EAN. Retrying after ${retryAfter / 1000} seconds...`);

          // Wait for the retry period before retrying
          await new Promise(resolve => setTimeout(resolve, retryAfter));

          // Retry the request with exponential backoff
          return getInventoryItemIdByEAN(shopName, accessToken, ean, retries - 1, retryDelay * 2);  // Exponentially increase the delay
        } else {
          console.error('Error fetching inventory item by EAN:', error);
          throw new Error('Failed to retrieve inventory item by EAN');
        }
      }
    }

    if (!inventoryItemId) {
      console.error(`Inventory item for EAN ${ean} not found.`);
      throw new Error(`Inventory item for EAN ${ean} not found.`);
    }

    return inventoryItemId;
  } catch (error) {
    console.error('Error fetching inventory item by EAN:', error);
    throw new Error('Failed to retrieve inventory item by EAN');
  }
}






async function getLocationIds(shopName, accessToken) {
  try {
    const response = await axios.get(`https://${shopName}/admin/api/2023-10/locations.json`, {
      headers: {
        'X-Shopify-Access-Token': accessToken
      }
    });

    const locations = response.data.locations;
    if (locations.length === 0) {
      console.error('No locations found for this shop.');
      return [];
    }

    return locations; // Returns array of locations with their IDs
  } catch (error) {
    console.error('Error fetching locations:', error);
    throw error;
  }
}

// Route to get API details based on shop from session
router.get('/api/getShopAPIData', async (ctx) => {
  try {
    const shopName = ctx.session.shop;
    console.log("Shop name from session:", shopName);

    if (!shopName) {
      ctx.status = 400;
      ctx.body = { message: 'Shop name is required in session' };
      return;
    }

    // Wrap the callback-based database call in a promise
    const shopID = await new Promise((resolve, reject) => {
      db.getShopIDByShopName(shopName, (err, shopID) => {
        if (err) {
          console.error('Error fetching shopID:', err);
          reject(new Error('Error fetching shop ID'));
        }
        resolve(shopID);
      });
    });

    if (!shopID) {
      ctx.status = 404;
      ctx.body = { message: 'Shop ID not found for the given shop name' };
      return;
    }

    // Again, wrap the second database call in a promise
    const apiDetails = await new Promise((resolve, reject) => {
      db.getShopAPIDataByShopID(shopID, (err, apiDetails) => {
        if (err) {
          console.error('Error fetching API details:', err);
          reject(new Error('Error fetching API details'));
        }
        resolve(apiDetails);
      });
    });

    if (!apiDetails) {
      ctx.status = 404;
      ctx.body = { message: 'No API details found for this shop' };
      return;
    }

    // Successful response
    ctx.status = 200;
    ctx.body = {data:apiDetails}
    console.log('API Details Response:', ctx.body);

  } catch (error) {
    console.error('Unexpected error:', error);
    ctx.status = 500;
    ctx.body = { message: 'An unexpected error occurred', error: error.message };
  }
});
router.get('/api/cancel', async (ctx) => {
  // Set the cancel flag to true to cancel ongoing operations
  ctx.cancel = true;
  console.log('Operation has been cancelled.');
  ctx.body = { message: 'Process cancelled.' };
});

router.get('/api/create-products', async (ctx) => {
  // Initialize cancel flag
  ctx.cancel = false;

  // Step 1: Parse XML File
  const readXMLFile = async () => {
    console.log("Starting XML Parsing...");
    try {
      // Check if the process is cancelled before reading the file
      if (ctx.cancel) {
        console.log("Process cancelled before reading file.");
        return null;
      }

      const filePath = 'uploads/' + "botdigit.myshopify.com" + ".xml";
      console.log("Reading File: ", filePath);
      const parseXML = async () => {
        console.log("Welcome Here too");
        try {
          async function readFile() {
            const text = await fs.readFile('uploads/'+ctx.session.shop+".xml", 'utf-8'); // Reads the file content as a string
            return text; // Output the content of the XML file
          }
          
          let text = await readFile();
          const data = xml2js(text, { compact: true });
          // console.log(data.offer.products)
          return data;
        } catch (error) {
          throw new Error('Error parsing XML file');
        }
      };
      // Read file asynchronously
      const fileContent = await fs.readFile(filePath, 'utf-8');
      return await parseXML(fileContent); // Parse the XML content asynchronously

    } catch (error) {
      console.error('Error reading or parsing XML file:', error);
      throw new Error('Error parsing XML file');
    }
  };

  // Step 2: Merge XML Data and Save to Database
  const mergeXMLData = async (products) => {
    let mergeData = [];
    let unmatchedEans = [];

    await Promise.all(products.map(async (product) => {
      if (ctx.cancel) {
        console.log("Process cancelled before processing product.");
        return;
      }

      let mergedVariants = [];
      let picturesArray = [];

      try {
        if (product.pictures && product.pictures.picture) {
          const pictures = Array.isArray(product.pictures.picture)
            ? product.pictures.picture
            : [product.pictures.picture];
          picturesArray = pictures.map(p => p._text).filter(url => url);
        }

        const variants = Array.isArray(product.variants.variant)
          ? product.variants.variant
          : [product.variants.variant];
        
        variants.forEach((variant) => {
          const eanCode = variant.code || variant._attributes?.code;
          if (!eanCode) {
            console.error(`Variant missing EAN code: ${JSON.stringify(variant)}`);
            unmatchedEans.push(variant);
            return;
          }
          mergedVariants.push({
            code: eanCode,
            size: variant.size || variant._attributes?.size || "Unknown"
          });
        });

        const mergedProduct = {
          ...product,
          pictures: picturesArray,
          variants: mergedVariants
        };

        if (ctx.cancel) {
          console.log("Process cancelled before saving to DB.");
          return;
        }

        // Save the merged product to the database
        const savedProduct = await db.saveProductToDB(mergedProduct);
        console.log("Saved Product:", savedProduct);

        mergeData.push(mergedProduct);

      } catch (error) {
        console.error('Error processing product:', error);
      }
    }));

    mergeData = mergeData.filter(product => product.variants.length > 0);

    if (unmatchedEans.length > 0) {
      console.log("Unmatched EANs:", unmatchedEans);
    }

    return { mergeData, unmatchedEans };
  };

  // Step 3: Execute the Process
  try {
    let xmlData = await readXMLFile();
    if (ctx.cancel) {
      console.log("Operation cancelled during XML parsing.");
      ctx.body = { message: "Process cancelled during XML parsing." };
      return;
    }
    console.log(xmlData)

    if (!xmlData ) {
      console.error("Invalid or empty XML data.");
      ctx.body = { message: "Invalid XML data." };
      return;
    }

    const products = xmlData.offer.products.product;
    let { mergeData } = await mergeXMLData(products);
    
    if (ctx.cancel) {
      console.log("Operation cancelled during data merging.");
      ctx.body = { message: "Process cancelled during data merging." };
      return;
    }

    ctx.body = { mergeData };

  } catch (error) {
    console.error("Error:", error);
    ctx.status = 500;
    ctx.body = { error: 'Internal Server Error' };
  }
});

router.post('/api/createProduct', async (ctx) => {
  const productData = ctx.request.body;

  // Validate required fields
  const { title, bodyHtml, vendor, productType, variants } = productData;

  if (!title || !bodyHtml || !vendor || !productType || !variants || variants.length === 0) {
      ctx.status = 400;
      ctx.body = { message: 'Title, body_html, vendor, product_type, and variants are required.' };
      return;
  }

  // Ensure valid shop information
  const shopName = ctx.session.shop; // Get shop name from session
  const accessToken = ctx.session.accessToken; // Get access token from session

  if (!shopName || !accessToken) {
      ctx.status = 400;
      ctx.body = { message: 'Shop name and access token are required.' };
      return;
  }

  // Prepare the product object for the REST API
  const product = {
      product: {
          title: productData.title,
          body_html: productData.bodyHtml,
          vendor: productData.vendor,
          product_type: productData.productType,
          tags: productData.tags ? productData.tags.split(',') : [],
          variants: productData.variants.map(variant => ({
              option1: variant.option1, // Required
              price: (variant.price && !isNaN(parseFloat(variant.price))) ? parseFloat(variant.price) :"",
              sku: variant.sku || null, // Optional SKU
              requires_shipping: variant.requiresShipping || false, // Optional shipping requirement
              inventory_management: "shopify",
              inventory_policy: "continue",
              inventory_quantity:variant.inventoryQuantity || 0,
              taxable: variant.taxable || false, // Optional taxable field
              barcode: variant.barcode || null // Optional barcode
          })),
          images: productData.images.map(image => ({
              src: image.originalSrc // Source URL for the image
          })),
          options: productData.options.map(option => ({
              name: option.name,
              values: option.values
          }))
      }
  };

  try {
      const shopifyAPIUrl = `https://${shopName}/admin/api/2023-10/products.json`;

      // Log the request being sent to Shopify for debugging
      console.log('Sending request to Shopify API:', product);

      // Make the POST request to Shopify's REST API
      const response = await axios.post(
          shopifyAPIUrl,
          product,
          {
              headers: {
                  'X-Shopify-Access-Token': accessToken,
                  'Content-Type': 'application/json',
              },
          }
      );

      // Log the full response from Shopify for debugging
      console.log('Shopify API response:', response.data);

      if (response.data.product) {
          ctx.status = 201;
          ctx.body = {
              message: 'Product created successfully.',
              product: response.data.product,
          };
      } else {
          ctx.status = 400;
          ctx.body = { message: 'Failed to create product.', response: response.data };
      }
  } catch (error) {
      console.error('Error creating product:', error);
      ctx.status = 500;
      ctx.body = { message: 'Error creating product', error: error.message };
  }
});

router.get('/api/get-products', async (ctx) => {
  try {
    // Get page and limit from query parameters, or set default values
    const page = parseInt(ctx.query.page) || 1; // Default to page 1
    const limit = parseInt(ctx.query.limit) || 100; // Default to 100 products per page

    // Calculate offset for pagination
    const offset = (page - 1) * limit;

    // Fetch the paginated products from the database
    const data = await db.getAllProductsFromDB(limit, offset); // Pass limit and offset to the DB query

    if (data && data.length > 0) {
      // Optionally, you can transform or merge data if needed
      const mergeData = data.map(product => ({
        ...product, 
        additionalInfo: "Some additional merged data"  // Example of adding more information
      }));

      // Get total count of products in the database for pagination info
      const totalCount = await db.countProducts();  // You should have a function to count all products

      // Return paginated results along with pagination details
      ctx.body = {
        status: 'success',
        data: mergeData,
        pagination: {
          page,
          limit,
          total: totalCount,  // Total number of products
          totalPages: Math.ceil(totalCount / limit)  // Total number of pages
        }
      };
    } else {
      ctx.body = {
        status: 'error',
        message: 'No products found'
      };
    }
  } catch (err) {
    console.error('Error in /api/get-products:', err);
    ctx.body = {
      status: 'error',
      message: 'An error occurred while fetching the products'
    };
  }
});

router.get('/api/get-categories', async (ctx) => {
  try {
    const categories = await db.getCategories(); // Call the helper function

    ctx.status = 200;
    ctx.body = { categories }; // Return categories to the client
  } catch (err) {
    ctx.status = 500;
    ctx.body = { status: 'error', message: err };
  }
});


// Function to get shopID by shopName


// Function to get API details by shopID
const syncShopifyProducts = async (shopUrl, accessToken, syncType, selectedCategories, selectedProductIds) => {
  console.log("me",syncType)
  try {
    // Validate syncType
    if (!['all', 'categories', 'product_ids'].includes(syncType)) {
      throw new Error(`Invalid syncType: ${syncType}`);
    }

    const baseUrl = `https://${shopUrl}/admin/api/2023-10`; // Shopify API base URL
    const headers = {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    };
    
    // Fetch products to sync based on syncType
    let productsToSync = [];
    if (syncType === 'all') {
      await syncAllProducts(baseUrl,headers,shopUrl)
      // Fetch all products from DB
    } else if (syncType === 'product_ids') {
      // Fetch selected products by IDs
      console.log("selectedProductIds",selectedProductIds)
      productsToSync = await db.getProductsByProductIDsFromDB(selectedProductIds);
      console.log("Data here",productsToSync)
    }

    // Sync Categories if selected or syncType is 'all'
    // TODO: Varient Need to Change
    if (syncType === 'categories' || syncType === 'all') {
      console.log("hi10")
      let shop= shopUrl.split('.')[0]
      console.log(shop)
      await syncCategories(selectedCategories, baseUrl, headers,shopUrl);
    }

    // Sync Products based on selected product IDs or syncType 'all'
    if (syncType === 'product_ids' || syncType === 'all') {

      await syncProducts(productsToSync, baseUrl, headers,shopUrl);
    }

    return { message: 'Sync successful' };

  } catch (error) {
    console.error('Error syncing with Shopify:', error.message);
    throw new Error('Error syncing products with Shopify');
  }
};


const fetchFactoryPriceData = async (sku) => {
  const url = `https://api.factoryprice.eu/stocks/${sku}?username=info@aboutstyle.lt&salt=ABC707B5-3720`;

  try {
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) {
      console.error(`Failed to fetch data for SKU: ${sku}, Status: ${response.status}`);
      return null;
    }

    // Get the response as text (since it's XML)
    const responseText = await response.text();

    // Initialize the XML parser
    const jsonObj = parser.parse(responseText); // Parse XML to JSON object

    // Extract values from the parsed JSON object
    const ean = jsonObj.response?.stock?.ean || "Unknown EAN";
    const stockAvailable = parseFloat(jsonObj.response?.stock?.stock_available || 0);

    return { ean, stockAvailable };
  } catch (error) {
    console.error(`Error fetching data for SKU: ${sku}`, error.message);
    return null;
  }
};

const RunMe = async (shopUrl, accessToken, syncType, selectedCategories, selectedProductIds) => {
  try {
    console.log(shopUrl, accessToken, syncType, selectedCategories, selectedProductIds)
    const shop_id = shopUrl; // Assuming shopUrl is unique for each shop
    const baseUrl = `https://${shopUrl}/admin/api/2023-10`; // Shopify API base URL
    const headers = {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    };

    // Ensure syncType is valid
    if (!syncType ){
      console.error('Invalid sync type specified');
      await db.insertLog('error', 'Invalid sync type specified', shop_id);
      return;
    }

    if (syncType === 'product_ids' && selectedProductIds.length > 0) {
      // Sync products by product IDs
      console.log(`Syncing products by product IDs: ${selectedProductIds}`);
      await db.insertLog('info', `Syncing products by product IDs: ${selectedProductIds.join(', ')}`, shop_id);
      await syncProducts(selectedProductIds, baseUrl, headers, shopUrl);
    } else if (syncType === 'categories' && selectedCategories.length > 0) {
      // Sync products by categories
      console.log(`Syncing products by categories: ${selectedCategories}`);
      await db.insertLog('info', `Syncing products by categories: ${selectedCategories.join(', ')}`, shop_id);
      await syncCategories(selectedCategories, baseUrl, headers, shopUrl);
    } else {
      console.log('No valid product IDs or categories selected for syncing.');
      await db.insertLog('warning', 'No valid product IDs or categories selected for syncing.', shop_id);
    }

    console.log(`Sync process completed for shop: ${shopUrl}`);
    await db.insertLog('info', `Sync process completed for shop: ${shopUrl}`, shop_id);
  } catch (error) {
    console.error('Error in RunMe:', error.message || error);
    await db.insertLog('error', `Error in RunMe: ${error.message || error}`, shopUrl);
    throw new Error('Error during sync process');
  }
};
router.get('/api/logs', async (ctx) => {
  const shopName = ctx.session.shop;  // Getting the shop name from the session
  const limit = ctx.query.limit || 50; // Default limit to 50 if not provided

  // Validate the shopName (simple validation for example purposes)
  if (!shopName) {
    ctx.status = 400;
    ctx.body = { error: 'Shop Name is required' };
    return;
  }

  try {
    // Await the result from the getLogsByShop function
    const logs = await db.getLogsByShop(shopName, limit);

    if (logs.length === 0) {
      ctx.status = 404;
      ctx.body = { message: 'No logs found for this shop' };
    } else {
      ctx.status = 200;
      ctx.body = { shopName, logs };
    }
  } catch (error) {
    console.error("Error fetching logs:", error);
    ctx.status = 500;
    ctx.body = { error: 'Failed to retrieve logs', details: error.message };
  }
});

// API endpoint to get logs by shopId



// Helper function to sync Categories
// Helper function to sync Categories with logging
const syncCategories = async (selectedCategories, baseUrl, headers, shopName) => {
  const shop_id = shopName;
  const PriceDetails = await db.getPriceAdjustmentByShopName(shopName);

  try {
    const selectedCurrency = await db.getCurrencyByShopName(shop_id);
    console.log('Selected Currency:', selectedCurrency);

    const exchangeRates = await fetchExchangeRate();
    console.log('Exchange Rates:', exchangeRates);

    for (const category of selectedCategories) {
      let offset = 0;

      while (true) {
        const productsToSync = await db.getProductsByCategoryFromDB([category], 50, offset);
        // console.log("productsToSync",productsToSync)
        if (productsToSync.length === 0) break;

        for (const product of productsToSync) {
          console.log("product.productID",product.productID)
          await db.insertLog('info', `Starting sync for product: ${product.productID} in category: ${product.category}`, shop_id);

          const parsedVariants = typeof product.variants === 'string' ? JSON.parse(product.variants || '[]') : [];
          const parsedImages = typeof product.pictures === 'string' ? JSON.parse(product.pictures || '[]') : [];
          console.log("parsedImages",parsedImages)
          console.log("parsedVariants",parsedVariants)
          if (!parsedVariants.length) {
            console.warn(`Skipping product ${product.productID} due to no variants.`);
            await db.insertLog('warning', `Skipping product ${product.productID} due to no variants`, shop_id);
            continue;
          }

          const uniqueHandle = `${product.productID || ''}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

          // Prepare the product payload
          const productPayload = {
            product: {
              body_html: product.description || '',
              handle: uniqueHandle,
              product_type: product.category || '',
              status: 'active',
              tags: product.gender ? `${product.gender}, ${product.category}, ${product.color}` : '',
              title: product.title,
              vendor: product.producer || '',
              images: parsedImages.map((image, index) => ({
                src: image,
                position: index + 1,
              })),
              variants: [],
              options: [{
                name: 'Size',
                position: 1,
                values: parsedVariants.map((variant) => variant.size || 'Default'),
              }],
            },
          };

          // Add all variants to the product payload
          for (const variant of parsedVariants) {
            const data = await fetchFactoryPriceData(variant.code);
            console.log("product.suggested_price_netto_pln",product.suggested_price_netto_pln)
            console.log("PriceDetails",PriceDetails)
            const adjustedPrice = PriceDetails.data.priceAdjustmentType === 'percentage'
              ? product.suggested_price_netto_pln * (1 + PriceDetails.data.priceAdjustmentAmount / 100)
              : parseInt(product.suggested_price_netto_pln) + parseInt(PriceDetails.data.priceAdjustmentAmount) || 10;
            console.log("adjustedPrice",adjustedPrice)
            console.log("exchangeRates[selectedCurrency]",exchangeRates[selectedCurrency])

            let convertedPrice = adjustedPrice * exchangeRates[selectedCurrency];

            // Ensure valid price
            if (isNaN(convertedPrice) || convertedPrice <= 0) {
              console.warn(`Invalid converted price for SKU ${variant.code}, falling back to default value.`);
              convertedPrice = 10.00;  // Default value if conversion fails
            }

            console.log(`Converted Price for ${variant.code}: ${convertedPrice}`);

            // Add each variant to the productPayload
            productPayload.product.variants.push({
              sku: variant.code || '',
              price: convertedPrice.toFixed(2),
              inventory_quantity: data?.stockAvailable || 0,
              option1: variant.size || 'Default',
              position: parsedVariants.indexOf(variant) + 1,
              inventory_management: 'shopify',
            });
          }

          const sku = parsedVariants[0]?.code; // Get the SKU from the first variant for checking

          if (!sku || sku.trim() === '') {
            console.warn(`Invalid SKU for product ${product.productID}, skipping update.`);
            await db.insertLog('warning', `Skipping product ${product.productID} due to invalid SKU.`, shop_id);
            continue;
          }

          try {
            const existingProductResponse = await axios.get(`${baseUrl}/products.json`, {
              headers,
              params: { sku },
            });

            const existingProduct = existingProductResponse.data.products.find((prod) =>
              prod.variants.some((v) => v.sku === sku)
            );

            if (existingProduct) {
              // If product exists, update it with all variants (add variants to existing product)
              const updateProductResponse = await axios.put(
                `${baseUrl}/products/${existingProduct.id}.json`,
                productPayload,
                { headers }
              );

              if (updateProductResponse.status === 200) {
                console.log(`Updated product with SKU: ${sku}`);
                await db.insertLog('info', `Updated product with SKU: ${sku}`, shop_id);
              } else {
                console.error(`Failed to update product with SKU: ${sku}`);
                await db.insertLog('error', `Failed to update product with SKU: ${sku}`, shop_id);
              }
            } else {
              // If product doesn't exist, create it with all variants at once
              const createProductResponse = await axios.post(`${baseUrl}/products.json`, productPayload, { headers });
              if (createProductResponse.status === 201) {
                console.log(`Created new product with SKU: ${sku}`);
                await db.insertLog('info', `Created new product with SKU: ${sku}`, shop_id);
              } else {
                console.error(`Failed to create product with SKU: ${sku}`);
                await db.insertLog('error', `Failed to create product with SKU: ${sku}`, shop_id);
              }
            }
          } catch (error) {
            console.error(`Error syncing SKU: ${sku}`, error.response?.data || error.message);
            await db.insertLog('error', `Error syncing SKU: ${sku}: ${error.message}`, shop_id);
          }
        }

        offset += 50;  // Increment offset for pagination
      }
    }

    console.log('Sync completed successfully for all categories.');
    await db.insertLog('info', 'Sync completed successfully for all categories.', shop_id);
  } catch (error) {
    console.error('Error syncing products by category:', error.message || error);
    await db.insertLog('error', `Error syncing products by category: ${error.message}`, shop_id);
    throw new Error('Error syncing products by category');
  }
};







router.get('/api/create/products', async (ctx) => {
  try {
    // Get the shop settings from the database
    const shopName = ctx.session.shop;
    const accessToken = ctx.session.accessToken;
    
    if (!shopName || !accessToken) {
      ctx.status = 400;
      ctx.body = { error: 'Shop URL or Access Token missing in session' };
      return;
    }

    const shopID = await new Promise((resolve, reject) => {
      db.getShopIDByShopName(shopName, (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });

    if (!shopID) {
      ctx.status = 404;
      ctx.body = { error: 'Shop ID not found' };
      return;
    }

    // Get shop sync settings
    const syncSettings = await db.getShopSyncSetting(shopID);
    if (!syncSettings) {
      ctx.status = 404;
      ctx.body = { error: 'Sync settings not found for the shop' };
      return;
    }

    const { sync_type, selected_categories, selected_product_ids } = syncSettings;
    const selectedCategories = selected_categories ? selected_categories.split(',') : [];
    const selectedProductIds = selected_product_ids ? selected_product_ids.split(',') : [];

    // Call RunMe with the retrieved settings
    const result = await RunMe(shopName, accessToken, sync_type, selectedCategories, selectedProductIds);

    // Respond with the result of the sync
    ctx.body = result;
  } catch (error) {
    console.error('Error syncing products:', error);
    ctx.status = 500;
    ctx.body = { error: 'Error syncing products' };
  }
});


function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const RATE_LIMIT_DELAY = 1000; // Delay of 1 second between requests




// Schedule a cron job to run every minute
cron.schedule('0 * * * *', async () => {
  try {
    // Start of sync
    // // logAction('Starting product sync for all Shopify stores...'); // Log start of sync
    console.log('Starting product sync for all Shopify stores...'); // Log to console for visibility

    // Fetch all shop credentials from your database
    const shops = await db.getAllShops();  // This should return an array of { shopName, accessToken }
    // logAction(`Fetched shops: ${JSON.stringify(shops)}`);  // Log fetched shops
    console.log(`Fetched shops: ${JSON.stringify(shops)}`); // Log to console for visibility

    if (!shops || shops.length === 0) {
      // logAction('No shops found for sync. Exiting...');
      console.log('No shops found for sync. Exiting...');
      return; // No shops to sync, exit early
    }

    // Loop through each shop and trigger the sync
    for (let shop of shops) {
      // logAction('start importing products for ',shop);
      const { shopName, accessToken } = shop;

      // Check if credentials are missing
      if (!shopName || !accessToken) {
        // logAction(`Skipping sync for ${shopName} due to missing credentials.`);
        console.log(`Skipping sync for ${shopName} due to missing credentials.`);
        continue;  // Skip this shop if credentials are missing
      }

      try {
        // logAction(`Syncing shop: ${shopName}`); // Log which shop we are syncing
        console.log(`Syncing shop: ${shopName}`); // Log to console for visibility

        // Get shop ID from the shop name
        const shopID = await new Promise((resolve, reject) => {
          db.getShopIDByShopName(shopName, (err, result) => {
            if (err) {
              // logAction(`Error fetching shop ID for ${shopName}: ${err}`); // Error log
              console.log(`Error fetching shop ID for ${shopName}: ${err}`);
              reject(err);
            } else {
              resolve(result);
            }
          });
        });

        if (!shopID) {
          // logAction(`Shop ID not found for ${shopName}. Skipping sync.`);
          console.log(`Shop ID not found for ${shopName}. Skipping sync.`);
          continue;
        }

        // Fetch sync settings for this shop
        const syncSettings = await db.getShopSyncSetting(shopID);
        if (!syncSettings) {
          // logAction(`Sync settings not found for shop ${shopName}. Skipping sync.`);
          console.log(`Sync settings not found for shop ${shopName}. Skipping sync.`);
          continue;
        }
        console.log(syncSettings)
        const { sync_type, selected_categories, selected_product_ids } = syncSettings[0];// Sqlite to Mysql 
        const selectedCategories = selected_categories ? selected_categories.split(',') : [];
        const selectedProductIds = selected_product_ids ? selected_product_ids.split(',') : [];

        // logAction(`Sync settings for ${shopName}: sync_type=${sync_type}, categories=${selectedCategories}, product_ids=${selectedProductIds}`);
        console.log(`Sync settings for ${shopName}: sync_type=${sync_type}, categories=${selectedCategories}, product_ids=${selectedProductIds}`);

        // Call RunMe with the retrieved settings for syncing
        // logAction(`Triggering sync for ${shopName}...`);
        console.log(`Triggering sync for ${shopName}...`);

        const result = await RunMe(shopName, accessToken, sync_type, selectedCategories, selectedProductIds);

        if (result) {
          // logAction(`Sync completed for shop ${shopName}.`); // Successful sync log
          console.log(`Sync completed for shop ${shopName}.`);
        } else {
          // logAction(`Sync failed for shop ${shopName}.`); // Sync failure log
          console.log(`Sync failed for shop ${shopName}.`);
        }

      } catch (error) {
        // logAction(`Error syncing shop ${shopName}: ${error.message || error}`); // Catch and log individual shop errors
        console.log(`Error syncing shop ${shopName}: ${error.message || error}`);
      }
    }

    // logAction('Product sync complete for all shops.'); // Completion log for all shops.
    console.log('Product sync complete for all shops.');

  } catch (error) {
    // logAction(`Error in cron job: ${error.message || error}`); // Catch and log errors in the entire cron job process
    console.log(`Error in cron job: ${error.message || error}`);
  }
});


// In your Koa router or Express route, handle the DELETE request
router.delete('/api/logs', async (ctx) => {
  const shopName = ctx.session.shop; // Assuming shopName is stored in the session

  if (!shopName) {
    ctx.status = 400;
    ctx.body = { error: 'Shop name is required' };
    return;
  }

  // Perform deletion from the database (using Promise for better error handling)
  try {
    await db.deleteLogsByShop(shopName);
    ctx.status = 200;
    ctx.body = { message: 'Logs deleted successfully' };
  } catch (error) {
    console.error('Error deleting logs:', error);
    ctx.status = 500;
    ctx.body = { error: 'Failed to delete logs', details: error.message };
  }
});

// Function to delete logs by shopName











// Ensure that convertedPrice is always valid before using parseFloat
const getValidConvertedPrice = (adjustedPrice, exchangeRate) => {
  let convertedPrice = 0;

  try {
    // Calculate the converted price
    convertedPrice = adjustedPrice * exchangeRate;
    // Ensure the value is a valid number and handle cases where it's not
    if (isNaN(convertedPrice) || convertedPrice <= 0) {
      console.warn('Invalid converted price, falling back to default value.');
      convertedPrice = 10.00;  // Default value
    }
  } catch (error) {
    console.error('Error calculating converted price:', error);
    convertedPrice = 10.00;  // Default value if there is an error
  }

  return convertedPrice;
};

const syncProducts = async (productIDs, baseUrl, headers, shopName) => {
  const shop_id = shopName; // Using shop_name as shop_id for logging purposes
  const PriceDetails = await db.getPriceAdjustmentByShopName(shopName);
  console.log(shop_id, PriceDetails);

  try {
    const selectedCurrency = await db.getCurrencyByShopName(shop_id);
    console.log('Selected Currency:', selectedCurrency);

    const exchangeRates = await fetchExchangeRate();
    const exchangeRate = exchangeRates[selectedCurrency];
    if (!exchangeRate) {
      throw new Error(`No exchange rate found for currency: ${selectedCurrency}`);
    }
    console.log('Exchange Rates:', exchangeRates);

    for (const productID of productIDs) {
      const product = await db.getProductByID(productID);

      if (!product) {
        console.warn(`Product with ID ${productID} not found in DB`);
        continue;
      }

      await db.insertLog('info', `Starting sync for product: ${product.productID}`, shop_id);

      const parsedVariants = typeof product.variants === 'string' ? JSON.parse(product.variants || '[]') : [];
      const parsedImages = typeof product.pictures === 'string' ? JSON.parse(product.pictures || '[]') : [];

      if (!parsedVariants.length) {
        console.warn(`Skipping product ${product.productID} due to no variants.`);
        await db.insertLog('warning', `Skipping product ${product.productID} due to no variants`, shop_id);
        continue;
      }

      const uniqueHandle = `${product.productID}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const productPayload = {
        product: {
          body_html: product.description || '',
          handle: uniqueHandle,
          product_type: product.category || '',
          status: 'active',
          tags: product.gender ? `${product.gender}, ${product.category}, ${product.color}` : '',
          title: product.title,
          vendor: product.producer || '',
          images: parsedImages.map((image, index) => ({
            src: image,
            position: index + 1,
          })),
          variants: [],
          options: [{
            name: 'Size',
            position: 1,
            values: parsedVariants.map((variant) => variant.size || 'Default'),
          }],
        },
      };

      // Loop through variants to calculate prices and add them
      for (const variant of parsedVariants) {
        const data = await fetchFactoryPriceData(variant.code);

        // Recalculate the adjusted price for each variant and product
        const adjustedPrice = PriceDetails.data.priceAdjustmentType === 'percentage'
          ? product.suggested_price_netto_pln * (1 + PriceDetails.data.priceAdjustmentAmount / 100)
          : product.suggested_price_netto_pln + PriceDetails.data.priceAdjustmentAmount || 10;

        // Recalculate converted price for each variant based on the exchange rate
        let convertedPrice = adjustedPrice * exchangeRate;

        // Ensure valid convertedPrice and apply fallback if necessary
        if (isNaN(convertedPrice) || convertedPrice <= 0) {
          console.warn(`Invalid converted price for SKU ${variant.code}, falling back to default value.`);
          convertedPrice = 10.00;  // Default value in case of invalid price
        }

        console.log(`Converted Price for ${variant.code}: ${convertedPrice}`);

        // Add the variant data to the product payload
        productPayload.product.variants.push({
          sku: variant.code || '',
          price: convertedPrice.toFixed(2),
          inventory_quantity: data?.stockAvailable || 0,
          option1: variant.size || 'Default',
          position: parsedVariants.indexOf(variant) + 1,
          inventory_management: 'shopify',
        });

        // If the product already exists, update the variant
        const sku = variant.code;
        if (!sku || sku.trim() === '') {
          console.warn(`Invalid SKU for product ${product.productID}, skipping update.`);
          await db.insertLog('warning', `Skipping product ${product.productID} due to invalid SKU.`, shop_id);
          continue;
        }

        try {
          const existingProductResponse = await axios.get(`${baseUrl}/products.json`, {
            headers,
            params: { sku },
          });

          const existingProduct = existingProductResponse.data.products.find((prod) =>
            prod.variants.some((v) => v.sku === sku)
          );

          if (existingProduct) {
            const existingVariant = existingProduct.variants.find((v) => v.sku === sku);

            if (existingVariant) {
              // Recalculate price before updating
              const updatedConvertedPrice = adjustedPrice * exchangeRate;

              const updateVariantResponse = await axios.put(
                `${baseUrl}/products/${existingProduct.id}/variants/${existingVariant.id}.json`,
                {
                  variant: {
                    price: updatedConvertedPrice.toFixed(2),  // Use recalculated converted price
                    inventory_quantity: data?.stockAvailable || 0,
                    inventory_management: 'shopify',
                  },
                },
                { headers }
              );

              if (updateVariantResponse.status === 200) {
                console.log(`Updated variant with SKU: ${sku}`);
                await db.insertLog('info', `Updated variant with SKU: ${sku}`, shop_id);
              } else {
                console.error(`Failed to update variant with SKU: ${sku}`);
                await db.insertLog('error', `Failed to update variant with SKU: ${sku}`, shop_id);
              }
            }
          } else {
            const createResponse = await axios.post(`${baseUrl}/products.json`, productPayload, { headers });
            console.log(`Created new product with SKU: ${sku}`);
            await db.insertLog('info', `Created new product with SKU: ${sku}`, shop_id);
          }
        } catch (error) {
          console.error(`Error syncing SKU: ${sku}`, error.response?.data || error.message);
          await db.insertLog('error', `Error syncing SKU: ${sku}: ${error.message}`, shop_id);
        }
      }
    }

    console.log("Sync completed successfully for all products.");
    await db.insertLog('info', 'Sync completed successfully for all products.', shop_id);

  } catch (error) {
    console.error("Error syncing products:", error.message || error);
    await db.insertLog('error', `Error syncing products: ${error.message}`, shop_id);
    throw new Error('Error syncing products');
  }
};








async function fetchExchangeRate(baseCurrency) {
  try {
    const response = await axios.get(`https://open.er-api.com/v6/latest/USD`);
    return response.data.rates;
  } catch (error) {
    console.error("Error fetching exchange rates:", error.message);
    throw new Error("Failed to fetch exchange rates.");
  }
}

const syncAllProducts = async (baseUrl, headers, shopName) => {
  const shop_id = shopName;
  try {
    const batchSize = 100;
    let offset = 0;
    let productsBatch;

    console.log("Starting full product sync...");
    await db.insertLog('info', 'Starting full product sync...', shop_id);

    do {
      // Fetch products in batches
      productsBatch = await getAllProductsFromDB(batchSize, offset);
      console.log(`Fetched ${productsBatch.length} products with offset ${offset}`);
      await db.insertLog('info', `Fetched ${productsBatch.length} products with offset ${offset}`, shop_id);

      if (productsBatch.length > 0) {
        // Extract productIDs from the batch
        const productIDs = productsBatch.map(product => product.productID);

        // Call the syncProducts function for the current batch
        try {
          await syncProducts(productIDs, baseUrl, headers, shopName);
          await db.insertLog('info', `Successfully synced batch with ${productsBatch.length} products.`, shop_id);
        } catch (error) {
          console.error(`Error syncing batch with offset ${offset}: ${error.message || error}`);
          await db.insertLog('error', `Error syncing batch with offset ${offset}: ${error.message || error}`, shop_id);
        }
      }

      // Increment offset for the next batch
      offset += batchSize;
    } while (productsBatch.length > 0); // Continue until no more products are retrieved

    console.log("Sync all products completed successfully.");
    await db.insertLog('info', 'Sync all products completed successfully.', shop_id);
  } catch (error) {
    console.error("Error in syncAllProducts:", error.message || error);
    await db.insertLog('error', `Error in syncAllProducts: ${error.message || error}`, shop_id);
  }
};




// Router handling the /sync-shopify request
router.get('/api/sync-shopify', async (ctx) => {
  try {
    // Validate session data
    if (!ctx.session.shop || !ctx.session.accessToken) {
      ctx.status = 400;
      ctx.body = { error: 'Shop URL or Access Token missing from session.' };
      return;
    }

    // Get shop ID from session or DB
    const shopID = await new Promise((resolve, reject) => {
      db.getShopIDByShopName(ctx.session.shop, (err, shopID) => {
        if (err) {
          reject(new Error('Shop not found in database'));
        } else {
          resolve(shopID);
        }
      });
    });
    console.log(shopID)
    // Fetch sync settings from the database
    const syncSettings = await db.getShopSyncSetting(shopID);
    console.log(syncSettings)
    // If no sync settings found for this shopId, return an error
    if (syncSettings.message) {
      ctx.status = 404;
      ctx.body = { error: syncSettings.message };
      return;
    }

    // Extract sync type, selected categories, and selected product IDs from syncSettings
    const { sync_type, selected_categories, selected_product_ids } = syncSettings;
    // Convert selected_categories (string) into an array, split by comma
    const selectedCategories = selected_categories ? selected_categories.split(',') : [];
    const selectedProductIds = selected_product_ids ? selected_product_ids.split(',') : [];

    // Fetch shop URL and access token (from session)
    const shopUrl = ctx.session.shop;
    const accessToken = ctx.session.accessToken;

    // Sync products with Shopify
    const result = await syncShopifyProducts(shopUrl, accessToken, sync_type, selectedCategories, selectedProductIds);

    // Return success response with result
    ctx.status = 200;
    ctx.body = {
      message: result.message,
      result,
    };
  } catch (error) {
    // Return error if something goes wrong
    console.error('Error in syncShopify route:', error.message);
    ctx.status = 500;
    ctx.body = { error: 'Error syncing with Shopify', details: error.message };
  }
});


 router.get('/api/get-price-adjustment', async (ctx) => {
  const { shop } = ctx.session;  // Get shop name from session

  // Check if the shop name is provided in the session
  if (!shop) {
    ctx.status = 400;
    ctx.body = { message: 'Shop name is required.' };
    return;
  }

  try {
    // Fetch price adjustment data based on shop name
    const data = await db.getPriceAdjustmentByShopName(shop);

    if (data) {
      ctx.status = 200;
      ctx.body = data;  // Return price adjustment data
    } else {
      ctx.status = 404;
      ctx.body = { message: `Price adjustment settings for shop "${shop}" not found.` };
    }
  } catch (error) {
    // Log the error and respond with a 500 Internal Server Error
    console.error('Error in /api/get-price-adjustment route:', error);
    ctx.status = 500;
    ctx.body = { message: 'Internal server error, please try again later.' };
  }
});


  
  
router.post('/api/new', async (ctx) => {
  console.log("Hi")
});
  
  


  server.use(graphQLProxy({ version: ApiVersion.October19 }));

  router.get('*', verifyRequest(), async (ctx) => {
    await handle(ctx.req, ctx.res);
    ctx.respond = false;
    ctx.res.statusCode = 200;
  });

  server.use(router.allowedMethods());
  server.use(router.routes());
  
  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
