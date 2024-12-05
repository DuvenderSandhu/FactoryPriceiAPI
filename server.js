require('isomorphic-fetch');
const express = require('express');
const bodyParser = require('koa-bodyparser');
const dotenv = require('dotenv');
const Koa = require('koa');
const next = require('next');
const fs = require('fs');
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
const port = parseInt(process.env.PORT, 10) || 3000;
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const { SHOPIFY_API_SECRET_KEY, SHOPIFY_API_KEY, HOST } = process.env;

// Create a new table for storing shop details (shopName and accessToken)
const parser= new XMLParser()

app.prepare().then(() => {
  const server = new Koa();
  const router = new Router();
  server.use(bodyParser({ enableTypes: ['json'] }));
  
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
  router.post('/webhooks/products/create', webhook, (ctx) => {
    console.log('Received webhook:', ctx.state.webhook);
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




// const axios = require('axios'); // To make HTTP requests to Shopify API

// Add the create product route

router.post('/api/createProduct', async (ctx) => {
  const productData = ctx.request.body;

  console.log('Received product data:', productData);

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
              price: (variant.price && !isNaN(parseFloat(variant.price))) ? parseFloat(variant.price) : 0,

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
        const stockAvailable = parseFloat(stockItem.stock_available);

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


// Function to get shopID by shopName


// Function to get API details by shopID


router.post('/api/update-price-adjustment', async (ctx) => {
  const {  priceAdjustmentType, priceAdjustmentAmount } = ctx.request.body;

  // Validate input
  if (!priceAdjustmentType || !priceAdjustmentAmount) {
    ctx.status = 400;
    ctx.body = { error: 'shopName, priceAdjustmentType, and priceAdjustmentAmount are required' };
    return;
  }

  try {
    const result = await db.updatePriceAdjustment(ctx.session.shop, priceAdjustmentType, priceAdjustmentAmount);
    ctx.status = 200;
    ctx.body = { message: result };
  } catch (err) {
    ctx.status = 500;
    ctx.body = { error: err };
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
