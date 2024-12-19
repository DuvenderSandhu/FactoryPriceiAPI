// const { XMLParser } = require("fast-xml-parser");

// let parser=new XMLParser()


// async function fetchData() {
//     const url = 'https://api.factoryprice.eu/stocks/2016103136230?username=info@aboutstyle.lt&salt=ABC707B5-3720';
    
//     try {
//       // Send GET request
//       const response = await fetch(url, {
//         method: 'GET', // Specify the HTTP method
//         headers: {
//           // Add any necessary headers here if required
//           'Content-Type': 'application/json',
//         }
//       });
  
//       // Check if the response is successful (status 200-299)
//       if (!response.ok) {
//         throw new Error(`HTTP error! status: ${response.status}`);
//       }
  
//       // Read the response body as a string
//       const responseInfo = await response.text();
//       let xml= await parser.parse(responseInfo)
//       console.log(xml)
//       // Log or process the response
//     //   console.log(responseInfo);
//     } catch (error) {
//       console.error('Error fetching data:', error);
//     }
//   }


//   async function sendOrderXML() {
//     const url = "https://api.factoryprice.eu/orders"; // URL of the API
  
//     // Construct the XML data as a string
//     const xmlData = `<OrderXml>
//     <docXml>
//       <orders>
//         <order>
//           <header>
//             <number></number>
//             <order_date>2021-11-01</order_date>
//             <order_status>canceled</order_status>
//             <order_type>B2B</order_type>
//             <order_amount>0.00</order_amount>
//             <client_ID>USER_LOGIN</client_ID>
//             <comments>Comments</comments>
//             <dispatch_Firstname>Jan</dispatch_Firstname>
//             <dispatch_Lastname>Kowalski</dispatch_Lastname>
//             <dispatch_Country>Polska</dispatch_Country>
//             <dispatch_City>Warszawa</dispatch_City>
//             <dispatch_Postcode>01-900</dispatch_Postcode>
//             <dispatch_Street>Pulawska</dispatch_Street>
//             <dispatch_Number>101</dispatch_Number>
//             <dispatch_Phone>48666000001</dispatch_Phone>
//             <delivery_by>w</delivery_by>
//             <delivery_label_url></delivery_label_url>
//             <payment_type>prepaid</payment_type>
//             <delivery_method>UPS</delivery_method>
//             <codeDiscount> </codeDiscount>
//           </header>
//           <products>
//             <product productcode="2016103136230" qty="1"></product>
//             <product productcode="2016102557791" qty="1"></product>
//           </products>
//         </order>
//       </orders>
//     </docXml>
//     </OrderXml>`;
//     const queryParams = new URLSearchParams({
//       username: "info@aboutstyle.lt", // Replace with the actual username
//       salt: "ABC707B5-3720"      // Replace with the actual password
//     }).toString();
  
//     const finalUrl = `${url}?${queryParams}`; // Append query parameters to the URL
  
//     // Prepare data in x-www-form-urlencoded format
//     const formData = new URLSearchParams();
//     formData.append('docXml', xmlData); // Append XML data to docXml field
  
//     try {
//       const response = await fetch(finalUrl, {
//         method: 'POST',
//         headers: {
//           'Content-Type': 'application/x-www-form-urlencoded', // Correct content-type for URL encoding
//         },
//         body: formData, // Send the form data as the body
//       });
  
//       // Read the response as text
//       const responseInfo = await response.text();
  
//       // Log the response or handle it as necessary
//       console.log(responseInfo);
//     } catch (error) {
//       console.error("Error sending request:", error);
//     }
//   }
  

//   async function deleteOrder() {
//     const url = 'https://api.factoryprice.eu/orders/1970?username=info@aboutstyle.lt&salt=ABC707B5-3720';
  
//     try {
//       // Send DELETE request
//       const response = await fetch(url, {
//         method: 'DELETE', // Specify the HTTP method as DELETE
//         headers: {
//           'Content-Type': 'application/json', // Set appropriate headers if necessary
//           // Add any other headers if needed (e.g., Authorization)
//         }
//       });
  
//       // Check if the response is successful (status 200-299)
//       if (!response.ok) {
//         throw new Error(`HTTP error! status: ${response.status}`);
//       }
  
//       // Read the response body as text
//       const responseInfo = await response.text();
      
//       // Log or process the response
//       console.log('Response Info:', responseInfo);
      
//       return responseInfo; // You can return or use the response as needed
//     } catch (error) {
//       console.error('Error deleting order:', error);
//     }
//   }
  
//   // Call the function to initiate the DELETE request
//   deleteOrder();
  
const cron = require('node-cron');
const { getShopSyncSetting, getShopIDByShopName } = require('./db');
  
async function RunMe(){
  let shopID;
  let a =  await getShopIDByShopName("botdigit.myshopify.com",async (err,result)=>{
    console.log(err,result)
    if(result){
      let b=  await getShopSyncSetting(result)
      
    }
    else{
      console.error(err)
    }

  })
  

}

RunMe()


const tourSteps = [
  // Step for API Settings Tab with user instructions
  {
    target: ".ant-tabs-tab:nth-child(1)", // API Settings Tab
    content: (
      <>
        <h3>API Settings</h3>
        <p>In this step, you will configure your API credentials to connect the application to an external API.</p>
        <ol>
          <li><strong>Step 1:</strong> Enter your <strong>API Key</strong> in the provided input field.</li>
          <li><strong>Step 2:</strong> Enter your <strong>API Secret</strong> in the corresponding input field.</li>
          <li><strong>Step 3:</strong> Provide the <strong>API URL</strong> in the required field.</li>
          <li><strong>Step 4:</strong> Once all fields are completed, click the <strong>"Register API Settings"</strong> button to submit the data.</li>
        </ol>
        <p>If successful, the settings will be saved and a confirmation notification will appear.</p>
      </>
    ),
    placement: "bottom",
  },
  // Step for File Upload Tab with user instructions
  {
    target: ".ant-tabs-tab:nth-child(2)", // File Upload Tab
    content: (
      <>
        <h3>File Upload</h3>
        <p>In this step, you will upload the necessary product files for integration. The process involves several stages:</p>
        <ol>
          <li><strong>Step 1:</strong> Upload the first XML file by selecting <strong>Product File 1</strong> using the file input field. After selecting the file, it will be handled by the upload function.</li>
          <li><strong>Step 2:</strong> Once the first file is selected, click the <strong>"Save Product File (XML 1)"</strong> button. This will trigger the upload of the first XML file, and the button will show a loading spinner during the upload.</li>
          <li><strong>Step 3:</strong> After the first file is uploaded, click the <strong>"Create Products from XML"</strong> button. This will process the XML data to create products from the file.</li>
          <li><strong>Step 4:</strong> Once both XML files are uploaded, click the <strong>"Merge Files"</strong> button. This merges the data from both files into a single structure. The button will be disabled during the merge process.</li>
          <li><strong>Step 5:</strong> If any error occurs during the file upload or merging process, an error message will be shown in red, indicating what went wrong.</li>
          <li><strong>Step 6:</strong> After merging, a table will appear showing the mapped columns (xmlColumns) and the product data. This allows you to view how the data aligns with Shopify's required fields.</li>
          <li><strong>Step 7:</strong> Once the data is ready, click the <strong>"Download CSV"</strong> button to download the processed data in CSV format. The button will be disabled until the mapping is complete.</li>
          <li><strong>Step 8:</strong> If everything is mapped correctly, click the <strong>"Import Products"</strong> button to import the product data into the system. This button is enabled once there are merged data entries.</li>
          <li><strong>Step 9:</strong> Finally, the total number of products to be synced will be displayed below the "Import Products" button, showing how many products will be imported after the process completes.</li>
        </ol>
      </>
    ),
    placement: "bottom",
  },
  // Step for Sync Settings Tab
  {
    target: ".ant-tabs-tab:nth-child(4)", // Sync Settings Tab
    content: (
      <>
        <h3>Sync Settings</h3>
        <p>This tab allows you to configure how products are synchronized with Shopify. You can sync products in different ways:</p>
        <ol>
          <li><strong>Step 1:</strong> Choose the sync mode from the options: <strong>Sync All Products</strong>, <strong>Sync by Categories</strong>, or <strong>Sync by Product IDs</strong>.</li>
          <li><strong>Step 2:</strong> If syncing by categories, select the desired categories and click <strong>"Save Settings"</strong>.</li>
          <li><strong>Step 3:</strong> If syncing by product IDs, search for products and select them from the table. Then click <strong>"Save Settings"</strong>.</li>
          <li><strong>Step 4:</strong> Once your settings are saved, click the <strong>"Sync Products Now"</strong> button to initiate the sync with Shopify.</li>
          <li><strong>Step 5:</strong> After the sync is completed, you’ll receive a success notification.</li>
        </ol>
      </>
    ),
    placement: "bottom",
  },
];