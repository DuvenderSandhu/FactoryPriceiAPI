import React, { useState, useEffect } from 'react';
import { Form, Input, Button, notification, Select, Row, Col } from 'antd';

const { Option } = Select;

const ApiSettingsForm = ({ onApiSubmit, loading }) => {
  const [priceAdjustment, setPriceAdjustment] = useState({
    priceAdjustmentType: '',
    priceAdjustmentAmount: '',
    currency: 'USD',  // Default currency is USD
  });
  const [turnOff, setTurnOff] = useState(0);
  const [availableCurrencies, setAvailableCurrencies] = useState(['USD', 'EUR', 'INR']);
  const [apiData, setApiData] = useState({
    apikey: 'your-api-key-here',  // Hardcoded API Key
    apiSecret: 'your-api-secret-here',  // Hardcoded API Secret
    apiurl: 'https://your-api-url.com',  // Hardcoded API URL
      // Example currencies, hardcoded
  });

  useEffect(() => {
    const fetchPriceAdjustment = async () => {
    };
    fetchPriceAdjustment();
  }, [turnOff]);

useEffect(() => {
  const fetchApiData = async () => {
    try {
      const response = await fetch('/api/getShopAPIData'); // Replace with your actual API
      const result = await response.json();
      setApiData(result.data[0])
      if (response.ok && result?.data) {
        console.log("Result",result.data[0])
        setApiData(result.data[0]);
      } else {
        notification.error({ message: 'Error', description: 'Failed to fetch API data' });
      }
      console.log("API Data",apiData)
    } catch (error) {
      notification.error({ message: 'Error', description: 'Failed to fetch API data' });
    }
  };

  fetchApiData();
}, []);
  const [formApi] = Form.useForm(); // Form for API settings
  const [formPriceAdjustment] = Form.useForm(); // Form for Price Adjustment settings

  // Function to handle API settings submission
  const handleApiSubmit = async (values) => {
    const { apiKey, apiSecret, apiUrl } = values;

    if (!apiKey || !apiSecret || !apiUrl) {
      notification.error({
        message: 'Error',
        description: 'All fields are required (API Key, API Secret, and API URL).',
      });
      return;
    }

    try {
      const response = await fetch('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, apiSecret, apiUrl }),
      });

      const result = await response.json();

      if (response.ok) {
        notification.success({
          message: 'API Settings Registered',
          description: result.message || 'API settings were successfully registered!',
        });
        formApi.resetFields(); // Clear the form after successful submission
        if (onApiSubmit) onApiSubmit(values); // Optional: Pass data to parent
      } else {
        notification.error({
          message: 'Registration Failed',
          description: result.message || 'There was an issue registering the API settings.',
        });
      }
    } catch (error) {
      notification.error({
        message: 'Error',
        description: 'An error occurred while submitting the API settings.',
      });
    }
  };

  // Function to handle Price Adjustment settings submission
  const handlePriceAdjustmentSubmit = async (values) => {
    const { priceAdjustmentType, priceAdjustmentAmount } = values;
    console.log(values)

    if (!priceAdjustmentType || priceAdjustmentAmount === undefined) {
      notification.error({
        message: 'Error',
        description: 'Both fields (Price Adjustment Type and Amount) are required.',
      });
      return;
    }

    try {
      // Update the local state with form values for price adjustment
      setPriceAdjustment({
        priceAdjustmentType,
        priceAdjustmentAmount
      });
      console.log("Hi")

      // API request to update price adjustment and currency on the server
      const response = await fetch(`/api/update-price-adjustment`, {
        method: 'PUT',  // Assuming you are using PUT method for this API
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceAdjustmentType,
          priceAdjustmentAmount,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        notification.success({
          message: 'Price Adjustment Applied',
          description: result.message || 'Price adjustment has been successfully applied!',
        });
        formPriceAdjustment.resetFields(); // Clear the form after successful submission
        if (onApiSubmit) onApiSubmit(values); // Optional: Pass data to parent
      } else {
        notification.error({
          message: 'Price Adjustment Failed',
          description: result.message || 'There was an issue applying the price adjustment.',
        });
      }
    } catch (error) {
      console.log("error",error)
      notification.error({
        message: 'Error',
        description: 'An error occurred while submitting the price adjustment settings.',
      });
    }
  };

  // Function to handle currency change
  const handleCurrencyChange = async (newCurrency) => {
    try {
      const response = await fetch(`/shop/change/currency?currency=${newCurrency}`, {
        method: 'GET',  // Use GET request
        headers: { 'Content-Type': 'application/json' },
      });
  
      const result = await response.json();
  
      if (response.ok) {
        notification.success({
          message: 'Currency Changed',
          description: `Currency has been successfully changed to ${newCurrency}.`,
        });
        setPriceAdjustment(prev => ({ ...prev, currency: newCurrency })); // Update the local state with the new currency
      } else {
        notification.error({
          message: 'Currency Change Failed',
          description: result.message || 'There was an issue changing the currency.',
        });
      }
    } catch (error) {
      notification.error({
        message: 'Error',
        description: 'An error occurred while changing the currency.',
      });
    }
  };
  

  return (
    <div>
      {/* API Settings Form */}
      <h4 className="text-lg font-medium mb-4">API Settings</h4>
      <Form
        form={formApi}
        onFinish={handleApiSubmit}
        layout="vertical"
        requiredMark={false}
      >
        <Form.Item
          label="API Key"
          name="apiKey"
          rules={[{ required: true, message: 'API Key is required' }]}>
          <Input  placeholder={apiData.apikey} />
        </Form.Item>

        <Form.Item
          label="API Secret"
          name="apiSecret"
          rules={[{ required: true, message: 'API Secret is required' }]}>
          <Input  placeholder={apiData.apiSecret}/>
        </Form.Item>

        <Form.Item
          label="API URL"
          name="apiUrl"
          rules={[{ required: true, message: 'API URL is required' }]}>
          <Input  placeholder={apiData.apiurl} />
        </Form.Item>

        <Button
          type="primary"
          htmlType="submit"
          loading={loading}
          className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white"
        >
          Register API Settings
        </Button>
      </Form>

      {/* Price Adjustment Form */}
      <h4 className="text-lg font-medium mb-4">Shop Settings</h4>
      <Form form={formPriceAdjustment} onFinish={handlePriceAdjustmentSubmit} layout="vertical" requiredMark={false} initialValues={{
        priceAdjustmentType: priceAdjustment.priceAdjustmentType,
        priceAdjustmentAmount: priceAdjustment.priceAdjustmentAmount,
        currency: priceAdjustment.currency, // Set initial currency
      }}>
        <Form.Item label="Price Adjustment Type" name="priceAdjustmentType" rules={[{ required: true, message: 'Please select a price adjustment type' }]} >
          <Select placeholder="Select price adjustment type">
            <Option value="fixed">Fixed</Option>
            <Option value="percentage">Percentage</Option>
          </Select>
        </Form.Item>

        <Form.Item label="Price Adjustment Amount" name="priceAdjustmentAmount" rules={[{ required: true, message: 'Please enter the price adjustment amount' }]} >
          <Input type="number" min={0} placeholder="Enter Amount" />
        </Form.Item>

        <Form.Item label="Currency" name="currency" >
          <Select placeholder="Select Currency" defaultValue={priceAdjustment.currency} onChange={handleCurrencyChange}>
            {availableCurrencies && availableCurrencies.map((currency) => (
              <Option key={currency} value={currency}>{currency}</Option>
            ))}
          </Select>
        </Form.Item>

        <Button type="primary" htmlType="submit" loading={loading} className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white">
          Apply Price Adjustment
        </Button>
      </Form>

      {/* Display selected price adjustment type and amount */}
      <div>
        <strong>Type: </strong>
        <span>{priceAdjustment.priceAdjustmentType || 'Type not defined'}</span>
      </div>
      <div>
        <strong>Amount: </strong>
        <span>{priceAdjustment.priceAdjustmentAmount !== undefined ? `$${priceAdjustment.priceAdjustmentAmount}` : 'N/A'}</span>
      </div>
      <div>
        <strong>Currency: </strong>
        <span>{priceAdjustment.currency}</span>
      </div>
    </div>
  );
};

export default ApiSettingsForm;
