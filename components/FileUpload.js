import React, { useState,useEffect } from 'react';
import { Select, Button, Row, Col, Typography, Table, message, Spin ,notification} from 'antd';
import { xml2js } from 'xml-js';
import { saveAs } from 'file-saver';
import Papa from 'papaparse';
import PriceAdjustment from './PriceAdjustment'
const { Option } = Select;
const { Title, Text } = Typography;

function TopBar() {
  const [file1, setFile1] = useState(null);
  const [file2, setFile2] = useState(null);
  const [mergedData, setMergedData] = useState([]);
  const [xmlColumns, setXmlColumns] = useState([]);
  const [columnMappings, setColumnMappings] = useState({});
  const [disabledOptions, setDisabledOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [priceAdjustment, setPriceAdjustment] = useState(null);
  


  const fetchPriceAdjustment = async () => {
    try {
      // Use fetch to get data from the API
      const response = await fetch(`/api/get-price-adjustment`);

      if (!response.ok) {
        throw new Error('Error fetching price adjustment data');
      }

      // Parse the response as JSON
      const data = await response.json();

      if (data.priceAdjustmentType && data.priceAdjustmentAmount !== undefined) {
        setPriceAdjustment(data); // Set the state with fetched data

        // Show notification with the fetched price adjustment settings
        notification.success({
          message: 'Price Adjustment Settings',
          description: `Your setting has the type: ${data.priceAdjustmentType} and the amount: ${data.priceAdjustmentAmount}`,
        });
      } else {
        notification.error({
          message: 'No Data Found',
          description: `No price adjustment settings found for shop "${shopName}".`,
        });
      }
    } catch (error) {
      notification.error({
        message: 'Error Fetching Data',
        description: error.message || 'An error occurred while fetching the data.',
      });
    }
  };
  const handleFileUpload = (e, setFile) => {
    setFile(e.target.files[0]);
  };

  const parseXML = async (file) => {
    try {
      const text = await file.text();
      //console.log("Text",text)
      const data = xml2js(text, { compact: true });
      // //console.log("data",data)
      return data.stocks?.stock || data.offer.products.product;
    } catch (error) {
      throw new Error('Error parsing XML file');
    }
  };

  // Recursive function to get the field text (supports nested objects and arrays)
// Recursive function to get the field text (supports nested objects and arrays)
const getFieldText = (field) => {
  // If it's an array, recursively process each item
  if (Array.isArray(field)) {
    // For each item in the array, extract its text value and join them with commas
    return field.map(item => getFieldText(item)).join(', ');
  }
  
  // If the field is an object (XML-like structure), look for the _text or _cdata property
  else if (field && typeof field === 'object') {
    // If it's an object with _text, return the value of _text directly
    if (field._text) {
      return field._text;  // This returns the value of _text (like "352994")
    }
    
    // If it's an object with _cdata, return the value of _cdata
    if (field._cdata) {
      return field._cdata;  // This returns the value of _cdata (e.g., "<![CDATA[some content]]>")
    }

    // If the object has a nested array, process the array fields
    if (Array.isArray(field)) {
      return field.map(item => getFieldText(item)).join(', ');
    }

    // If it's a nested object without _text or _cdata, recursively extract text for all keys
    return Object.keys(field)
      .map(key => `${key}: ${getFieldText(field[key])}`)
      .join(', ');
  }

  // If it's a primitive value (string, number, etc.), return it directly
  return field || '';
};

const importProductToShopify = async (product) => {
  // Structure the product data to match Shopify's product creation API format
  console.log('Original Product:', product);
  
  const productData = await convertToShopifyProduct(product);
  console.log('Formatted Product Data for Shopify:', productData);
  
  // Make sure each variant has the correct price and inventory quantity
  // Ensure that the price and inventory quantity are set
  productData.product.variants.forEach((variant) => {
    // Set a default price and quantity if they are undefined or zero
    if (!variant.price || variant.price === '0.00') {
      // Example: Set price to a fallback value
      variant.price = variant.option1 === 'S' ? '22.00' :
                     variant.option1 === 'M' ? '24.75' : '16.50'; // Set based on size
    }

    if (variant.inventory_quantity === 0) {
      // Set a fallback inventory quantity if none is set
      variant.inventory_quantity = variant.option1 === 'S' ? 15 :
                                   variant.option1 === 'M' ? 2 : 1; // Set based on size
    }
  });

  try {
    // Send the product data to your Shopify backend
    const response = await fetch('/api/createProduct', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(productData.product),
    });

    // Check if the response is OK (status in the range of 200-299)
    if (response.ok) {
      const data = await response.json();
      //console.log('Product imported to Shopify:', data);
      message.success(`Product "${data.product.title}" imported successfully!`);
    } else {
      // Handle non-2xx responses
      const errorData = await response.json();
      console.error('Error importing product to Shopify:', errorData);
      message.error(`Error occurred while importing product "${product.title}".`);
    }
  } catch (error) {
    console.error('Error importing product to Shopify:', error);
  }
};

function convertToShopifyProduct(data) {
  // Helper function to extract variants
  const extractVariants = (variants) => {
    if (!variants || (Array.isArray(variants) && variants.length === 0)) {
      return []; // Return empty array if no variants are provided
    }

    // If variants is an object, convert it to an array
    if (typeof variants === 'object' && !Array.isArray(variants)) {
      variants = [variants];
    }

    return variants.map(variant => {
      // Extract price from wholesale_price_netto_PLN (using a fallback of '0.00' if invalid)
      const price = (variant.wholesale_price_netto_PLN && !isNaN(parseFloat(variant.wholesale_price_netto_PLN.replace(',', '.'))))
                    ? parseFloat(variant.wholesale_price_netto_PLN.replace(',', '.')).toFixed(2)
                    : '0.00';

      // Extract inventoryQuantity from qty, ensuring it's a number (default to 0 if not valid)
      const inventoryQuantity = parseInt(variant.qty, 10) || 0;

      return {
        option1: variant.size || '', // Size option
        sku: variant.code || '', // SKU code
        price:priceAdjustment.priceAdjustmentType === 'fixed'? price + priceAdjustment.priceAdjustmentAmount : (price + (price * priceAdjustment.priceAdjustmentAmount) / 100), // Price, formatted to 2 decimal places
        inventoryQuantity: inventoryQuantity, // Inventory quantity
        requiresShipping: true, // Set to true if the product requires shipping
        barcode: variant.ean || '', // Use EAN as barcode
        taxable: true // Assuming all products are taxable; adjust as needed
      };
    });
  };

  // Extract main fields
  const product = {
    title: data.display_name._cdata ||data.display_name._text ||data.display_name || '',
    bodyHtml: data.description_long._cdata || data.description_long._text || data.description_long || '',
    vendor: data.producer._cdata || '',
    productType: data.category._text || '',
    tags: `${data.gender._text || data.gender._cdata || data.gender ||""}, ${data.category._text || data.category._cdata || data.category || "" }, ${data.color._text || data.color._cdata || data.color ||""}`, // Concatenate tags
    variants: extractVariants(data.variants || []), // Process variants
    images: (data.pictures?.picture || []).map(pic => ({ originalSrc: pic._text || pic._cdata|| pic || "" })),
    options: [{
      name: "Size",
      values: (data.variants || []).map(v => v.size || '').filter((v, i, a) => a.indexOf(v) === i) // Unique sizes
    }]
  };

  // Add metafields for additional details
  product.metafields = [];
  const parameters = data.parameters?.parameter || [];
  parameters.forEach(param => {
    const { name, value } = param._attributes;
    product.metafields.push({
      namespace: "parameters",
      key: name.toLowerCase().replace(/ /g, "_"),
      value: value,
      valueType: "string"
    });
  });

  // Add material composition if available
  if (data.material_composition) {
    product.metafields.push({
      namespace: "material",
      key: "composition",
      value: data.material_composition._cdata || '',
      valueType: "string"
    });
  }

  // Add washing recipe if available
  if (data.washing_recipe) {
    product.metafields.push({
      namespace: "washing",
      key: "recipe",
      value: data.washing_recipe._cdata || '',
      valueType: "string"
    });
  }

  return { product }; // Return formatted product
}



// Handler function for importing multiple products
const handleProductImport = async () => {
  setLoading(true);
  setError(null);

  try {
    // Use forEach to iterate over mergedData and call the importProductToShopify function for each product
    await mergedData.forEach(async (product,i) => {
          await importProductToShopify(product);
    });

    setLoading(false);
    message.success('All products are being imported!');
  } catch (err) {
    //console.log(err);
    setLoading(false);

  }
};


  // Function to get the match percentage between two strings
  function getMatchPercentage(str1, str2) {
    let longer = str1.length > str2.length ? str1 : str2;
    let shorter = str1.length > str2.length ? str2 : str1;

    let matchCount = 0;
    for (let i = 0; i < shorter.length; i++) {
      if (longer[i] === shorter[i]) {
        matchCount++;
      }
    }

    return (matchCount / longer.length) * 100;
  }

  // Auto-map Shopify fields to XML columns based on string similarity
  const autoMapFields = (shopifyFields, xmlColumns) => {
    const autoMappings = {};

    xmlColumns.forEach((xmlColumn) => {
      // Check if the field is related to variations (if it includes 'variant_')
      shopifyFields.forEach((shopifyField) => {
        const matchPercentage = getMatchPercentage(shopifyField.toLowerCase(), xmlColumn.toLowerCase());

        // Check if the XML column is related to variants (has 'variant_' prefix)
        if (xmlColumn.includes('variant_')) {
          const variantShopifyField = `variant_${shopifyField.toLowerCase()}`;
          if (matchPercentage >= 30 && !autoMappings[variantShopifyField]) {
            autoMappings[variantShopifyField] = xmlColumn;
          }
        } else {
          if (matchPercentage >= 30 && !autoMappings[shopifyField]) {
            autoMappings[shopifyField] = xmlColumn;
          }
        }
      });
    });

    return autoMappings;
  };
 
  // const getFieldText = (item) => item._text || ""; // Helper function for object text extraction

  const mergeXMLData = async (obj1, obj2) => {
    let mergeData = [];
    let unmatchedEans = [];  // To store unmatched EAN codes
    
    // Ensure obj2 is an array and map obj2 by normalized EAN code for quick lookups
    if (!Array.isArray(obj2)) {
      throw new Error('obj2 must be an array of products');
    }
  
    // Create a map of obj2 products indexed by their normalized EAN code
    const obj2Map = new Map(obj2.map(item => [item.ean._text.trim().toLowerCase(), item]));
  
    // Iterate over products in obj1
    obj1.forEach((product,i) => {
      // Ensure product structure is correct
      if (!product.variants || !product.variants.variant) {
        console.error(`Invalid product structure in obj1: Missing variants in product`, product);
        return;  // Skip this product if it's not structured properly
      }
  
      let mergedVariants = [];
  
      // Iterate over variants of the product
      // //console.log(product.variants.variant)
      // Problematic 
      try{
        product.variants?.variant?.forEach((variant) => {
          const eanCode = variant._attributes?variant._attributes.code:variant.map((abc,i)=>abc)
          //console.log(eanCode)
  
        
          if (!eanCode) {
            console.error(`Variant missing EAN code: ${JSON.stringify(variant)}`);
            return;  // Skip this variant if there's no EAN code
          }
        // Try to find the matching item in obj2 using the normalized EAN code
        const matchingItem = obj2Map.get(eanCode);
        // //console.log("matchingItem",matchingItem)
        if (matchingItem) {
          // If match found, merge attributes from the matching item
          Object.keys(matchingItem).forEach(key => {
            if (matchingItem[key]?._text) {
              variant._attributes[key] = matchingItem[key]._text;
            } else if (Array.isArray(matchingItem[key])) {
              variant._attributes[key] = matchingItem[key].map(item => getFieldText(item));
            } else if (typeof matchingItem[key] === 'object') {
              variant._attributes[key] = getFieldText(matchingItem[key]);
            }
          });
        } else {
          // If no match found, log the EAN and add an error attribute to the variant
          console.error(`No matching product found in obj2 for EAN code: ${eanCode}`);
          unmatchedEans.push(eanCode);  // Collect unmatched EAN
          variant._attributes.error = `No match for EAN ${eanCode}`;  // Add error field to variant
        }
  
        // Push the merged variant (whether matched or not) to the array
        mergedVariants.push({ ...variant._attributes });
        // //console.log(mergedVariants)
        });
      }
      catch(e){
        //console.log(e)
      }
      // Merge the product with the merged variants
      const mergedProduct = {
        ...product,
        variants: mergedVariants 
      };
  
      // Push merged product to the result array
      mergeData.push(mergedProduct);
    });
  
    // Optional cleanup: filter out products with no variants (if desired)
    mergeData = mergeData.filter(product => product.variants.length > 0);
  
    // Log unmatched EANs for debugging purposes
    if (unmatchedEans.length > 0) {
      //console.log("Unmatched EANs:", unmatchedEans);
    }
  
    return { mergeData, unmatchedEans };
  };
  

  
  // // Helper function to process nested fields (if required)
  // const getFieldText = (item) => {
  //   if (item && item._text) {
  //     return item._text;
  //   } else if (typeof item === 'object') {
  //     return JSON.stringify(item); // You might want to convert objects or arrays into strings
  //   }
  //   return item;
  // };
  
  
  
  // Helper function to extract text values from an object (if it's an XML-like structure)

  

  // Handle merging and mapping XML data
const handleMergeAndMap = async () => {
  setLoading(true);
  setError(null);

  try {
    const data1 = await parseXML(file1);
    const data2 = await parseXML(file2);


    const {mergeData,unmatchedEans} = await mergeXMLData(data1, data2);
    const merged = mergeData
    setMergedData(merged);

    // Flatten and combine all keys, including keys from variations with 'variation_' prefix
    const combinedFields = [
      ...new Set(
        merged.flatMap((product) => {
          let fields = Object.keys(product); // Extract direct keys from product

          // Check for variation fields and prefix keys with 'variation_'
          // 
          if (product.variants) {
           
            // If variation is an object, prefix its keys
            if (typeof product.variants === 'object' && !Array.isArray(product.variants)) {
              
              fields = [...fields, ...Object.keys(product.variants).map(field => `variation_${field}`)];
            }
            // If variation is an array of objects, prefix keys of each object in the array
            else if (Array.isArray(product.variants)) {
              product.variants.forEach(variant => {
                fields = [
                  ...fields,
                  ...Object.keys(variant).map(field => `variation_${field}`)
                ];
              });
            }
          }
         
          return fields;
        })
      )
    ];

    // Remove the original 'variant' key if present and return final fields
    const finalFields = combinedFields.filter(field => !field.includes('variant'));
    //console.log(finalFields);

    // Set columns based on final fields and variations
    setXmlColumns(finalFields);

    // Auto-map Shopify fields to XML columns based on string similarity
    const autoMappings = autoMapFields(shopifyFields, finalFields);
    setColumnMappings(autoMappings);

    message.success("Files merged and fields auto-mapped successfully!");
  } catch (err) {
    setError("There was an error merging the files or parsing XML. Please check the files.");
    message.error("Error occurred during merge and mapping process.");
  } finally {
    setLoading(false);
  }
};


  // Handle selecting Shopify field to map to XML field
  const handleSelectShopifyField = (shopifyField, xmlColumn) => {
    if (disabledOptions.includes(xmlColumn)) {
      message.warning(`${shopifyField} has already been selected`);
      return;
    }

    setColumnMappings({ ...columnMappings, [shopifyField]: xmlColumn });
    setDisabledOptions([...disabledOptions, xmlColumn]);
  };

  // Handle CSV download
  const handleCSVDownload = () => {
    setLoading(true);
    setError(null);
  
    try {
      const csvData = mergedData.map((record) => {
        //console.log(mergedData)
        const row = {};
  
        // Map Shopify fields to XML fields
        Object.keys(columnMappings).forEach((shopifyField) => {
          const xmlField = columnMappings[shopifyField];
          // //console.log("field",shopifyField," Xml Field ",xmlField,"and Data is ",getFieldText(record[xmlField]))
          if (xmlField) {
            if (xmlField.startsWith('variation_')) {
              //console.log("Hi")
              // If the field is a variation, loop through the variants and find the correct value
              // We're assuming record.variants is an array of objects and each variant has keys like 'size', 'qty', etc.
              record.variants.forEach((variant, index) => {
                // Remove the 'variation_' prefix to match the variant's property (like 'size' or 'qty')
                const variantKey = xmlField.replace('variation_', '');
          
                // Check if the variant has this key
                if (variant.hasOwnProperty(variantKey)) {
                  // If the key exists, get its value and assign it to the Shopify field
                  row[shopifyField] = getFieldText(variant[variantKey]);
                  //console.log(`For ${shopifyField}, value:`, row[shopifyField]);
                }
              });
            } else {
              // If it's not a variation, just get the regular XML field from the record
              row[shopifyField] = getFieldText(record[xmlField]);
              // //console.log(`For ${shopifyField}, value:`, row[shopifyField]);
            }
          } else {
            // If no xmlField is available, set the value to empty
            row[shopifyField] = "";
          }
          
        });
  
        // Add all the XML columns that aren't already mapped to Shopify fields
        xmlColumns.forEach((xmlColumn) => {
          if (!Object.values(columnMappings).includes(xmlColumn)) {
            row[xmlColumn] = getFieldText(record[xmlColumn]);
          }
        });
  
        // Handle variations (with 'variant_' prefix)
        if (record.variants && Array.isArray(record.variants)) {
          record.variants.forEach((variant, index) => {
            Object.keys(variant).forEach((variantKey) => {
              const shopifyField = `variant_${variantKey}`;
              row[`${shopifyField}_${index + 1}`] = getFieldText(variant[variantKey]);
            });
          });
        }
  
        return row;
      });
  
      // Convert the data to CSV format
      const csv = Papa.unparse(csvData, {
        quotes: true,
        delimiter: ",",
        newline: "\r\n",
        header: true,
      });
  
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      saveAs(blob, "shopify_products.csv");
  
      message.success("CSV file downloaded successfully!");
    } catch (err) {
      setError("There was an error generating the CSV file. Please check the data.");
      message.error("Error occurred during CSV generation.");
    } finally {
      setLoading(false);
    }
  };
  

  // Handle product import

  const shopifyFields = [
    'Handle', 
    'Title', 
    'Body (HTML)', 
    'Vendor', 
    'Product Category',  
    'Image Src', 
    'Variant SKU', 
    'Variant Grams', 
    'Variant Inventory Qty',   
    'Variant Price',  
    'Variant Barcode', 
    'Variant Image', 
    'Variant Weight Unit', 
    'Variant Tax Code', 
    'Price / International', 
  ];

  const customFieldMappings = {
    'Handle': 'Product_id',
    'Title': 'display name'
  };
  // Recursive rendering of the select dropdown for nested fields
  const renderSelect = (shopifyField, xmlColumn) => {
  // Check if the field is related to variations (starts with 'variant_')
  if (shopifyField.startsWith('variant_')) {
    // Handle case where variations are involved
    const variantKey = shopifyField.replace('variant_', '');

    return (
      <Select
        value={columnMappings[shopifyField] || undefined}
        onChange={(value) => handleSelectShopifyField(shopifyField, value)}
        disabled={disabledOptions.includes(shopifyField)}
        dropdownMatchSelectWidth={false}
        style={{ width: 'auto' }}
      >
        {xmlColumns.filter(col => col.includes(variantKey)).map((col) => (
          <Option key={col} value={col} disabled={disabledOptions.includes(col)}>
            {col}
          </Option>
        ))}
      </Select>
    );
  }

  // For normal fields (non-variation fields)
  if (Array.isArray(xmlColumn)) {
    return (
      <Select
        value={columnMappings[shopifyField] || undefined}
        onChange={(value) => handleSelectShopifyField(shopifyField, value)}
        disabled={disabledOptions.includes(shopifyField)}
        dropdownMatchSelectWidth={false}
        style={{ width: 'auto' }}
      >
        {xmlColumn.map((item, index) => (
          <Option key={`${shopifyField}-${index}`} value={item}>
            {item}
          </Option>
        ))}
      </Select>
    );
  } else if (typeof xmlColumn === 'object' && xmlColumn !== null) {
    const nestedFields = Object.keys(xmlColumn);
    return (
      <Select
        value={columnMappings[shopifyField] || undefined}
        onChange={(value) => handleSelectShopifyField(shopifyField, value)}
        disabled={disabledOptions.includes(shopifyField)}
        dropdownMatchSelectWidth={false}
        style={{ width: 'auto' }}
      >
        {nestedFields.map((nestedKey) => (
          <Option key={`${shopifyField}-${nestedKey}`} value={`${shopifyField}.${nestedKey}`}>
            {nestedKey}
          </Option>
        ))}
      </Select>
    );
  }

  return (
    <Select
      value={columnMappings[shopifyField] || undefined}
      onChange={(value) => handleSelectShopifyField(shopifyField, value)}
      disabled={disabledOptions.includes(shopifyField)}
      dropdownMatchSelectWidth={false}
      style={{ width: 'auto' }}
    >
      {xmlColumns.map((col) => (
        <Option key={col} value={col} disabled={disabledOptions.includes(col)}>
          {col}
        </Option>
      ))}
    </Select>
  );
};


  const columns = [
    { title: 'Shopify Field', dataIndex: 'shopifyField' },
    { 
      title: 'Map to XML Field', 
      dataIndex: 'xmlField', 
      render: (_, record) => {
        const xmlColumn = columnMappings[record.shopifyField];
        return renderSelect(record.shopifyField, xmlColumn);
      }
    }
  ];

  const data = shopifyFields.map(field => ({
    key: field,
    shopifyField: field,
    xmlField: columnMappings[field],
  }));
    useEffect(()=>{
        fetchPriceAdjustment()
    },[])
  return (
    <div className="max-w-4xl mx-auto p-8 bg-white rounded-lg shadow-xl">
      <Title level={2} className="text-center text-indigo-600 mb-8">Shopify Product Uploader</Title>

      <div className="mb-6 space-y-6">
        <Row justify="space-between" align="middle">
          <Col><Text strong>Upload XML File 1:</Text></Col>
          <Col>
            <input
              type="file"
              onChange={(e) => handleFileUpload(e, setFile1)}
              className="file:border-2 file:border-gray-300 file:rounded-md file:px-4 file:py-2 file:bg-indigo-500 file:text-white hover:file:bg-indigo-600 transition duration-300 ease-in-out"
            />
          </Col>
        </Row>

        <Row justify="space-between" align="middle">
          <Col><Text strong>Upload XML File 2:</Text></Col>
          <Col>
            <input
              type="file"
              onChange={(e) => handleFileUpload(e, setFile2)}
              className="file:border-2 file:border-gray-300 file:rounded-md file:px-4 file:py-2 file:bg-indigo-500 file:text-white hover:file:bg-indigo-600 transition duration-300 ease-in-out"
            />
          </Col>
        </Row>
      </div>

      <Button
        type="primary"
        onClick={handleMergeAndMap}
        className="w-full mt-4"
        size="large"
        style={{ backgroundColor: "#4F46E5", borderColor: "#4F46E5" }}
        disabled={loading}
      >
        {loading ? <Spin size="small" /> : "Merge Files"}
      </Button>

      {error && (
        <div className="mt-4 p-4 bg-red-100 border-l-4 border-red-500 text-red-700">
          <Text>{error}</Text>
        </div>
      )}

      {xmlColumns.length > 0 && (
        <Table
          rowKey="shopifyField"
          columns={columns}
          dataSource={data}
          pagination={false}
          style={{ marginTop: '20px' }}
        />
      )}

      <Button
        type="primary"
        onClick={handleCSVDownload}
        className="w-full mt-4"
        size="large"
        disabled={loading || !Object.keys(columnMappings).length}
      >
        {loading ? <Spin size="small" /> : "Download CSV"}
      </Button>
    
      {mergedData.length > 0 && (
                    <PriceAdjustment/>
      )}
      {mergedData.length > 0 && (
        <Button
          type="primary"
          onClick={handleProductImport}
          className="w-full mt-4"
          size="large"
        >
          Import Products
        </Button>
      )}

      {mergedData.length > 0 && (
        <Text className="block mt-4">
          Total Products to Sync: {mergedData.length}
        </Text>
      )}
    </div>
  );
}

export default TopBar;
