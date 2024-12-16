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