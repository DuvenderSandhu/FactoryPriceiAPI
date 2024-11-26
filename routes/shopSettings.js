// routes/shopSettings.js
const express = require('express');
const ShopDetails = require('../models/ShopDetails');
const SaveRouter = express.Router();

// Get shop settings
SaveRouter.get('/getSettings', async (req, res) => {
  const { shop } = req.query; // Assumes shop name is passed as a query parameter
  try {
    const shopDetails = await ShopDetails.findOne({ shopName: shop });
    res.status(200).json({ shopDetails });
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving settings', error });
  }
});


// Save shop settings
SaveRouter.post('saveSettings', async (req, res) => {
    console.log("Hi")
  const { shopName, username, password, syncProducts, syncOrders } = req.body;
  try {
    let shop = await ShopDetails.findOne({ shopName });
    if (shop) {
      shop.username = username;
      shop.password = password;
      shop.syncProducts = syncProducts;
      shop.syncOrders = syncOrders;
    } else {
      shop = new ShopDetails({ shopName, username, password, syncProducts, syncOrders });
    }

    await shop.save();
    res.status(200).json({ message: 'Settings saved successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error saving settings', error });
  }
});

module.exports = SaveRouter;
