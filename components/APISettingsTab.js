import React, { useEffect, useState } from 'react';
import { Form, Input, Button, notification } from 'antd';

const ApiSettingsForm = ({ onApiSubmit }) => {
  let [apiData,setApiData]= useState({})
  let [priceAdjustment,setPriceAdjustment]= useState({})
  useEffect(() => {
    const fetchApiData = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/getShopAPIData'); // Replace with your actual API
        const result = await response.json();
        if (response.ok && result?.data) {
          setApiData(result.data);
        } else {
          notification.error({ message: 'Error', description: 'Failed to fetch API data' });
        }
      } catch (error) {
        notification.error({ message: 'Error', description: 'Failed to fetch API data' });
      } finally {
        setLoading(false);
      }
    };
    const fetchPriceAdjustment = async () => {
      try {
        // Use fetch to get data from the API
        const response = await fetch(`/api/get-price-adjustment`);
  
        if (!response.ok) {
          throw new Error('Error fetching price adjustment data');
        }
  
        // Parse the response as JSON
        const sample = await response.json();
        const data= sample.data
  
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
    fetchPriceAdjustment()
    fetchApiData();
  }, []);
  const [loading, setLoading] = useState(false);

  // Submit handler for API settings
  const handleSubmit = async (values) => {
    setLoading(true);

    try {
      // Send the POST request to the backend
      const response = await fetch('/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values), // Send apiKey, apiSecret, apiUrl
      });

      const result = await response.json();

      if (response.ok) {
        notification.success({
          message: 'API settings registered successfully',
          description: result.message,
        });
        // Optionally, reset the form or do other actions
      } else {
        notification.error({
          message: 'API registration failed',
          description: result.message || 'An error occurred while registering API settings.',
        });
      }
    } catch (error) {
      notification.error({
        message: 'Error',
        description: 'An unexpected error occurred. Please try again later.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form onFinish={handleSubmit} layout="vertical">
      <Form.Item
        label="API Key"
        name="apiKey"
        value={apiData.apiKey}
        rules={[{ required: true, message: 'Please enter the API Key' }]}
      >
        <Input placeholder="Enter API Key" />
      </Form.Item>

      <Form.Item
        label="API Secret"
        name="apiSecret"
        value={apiData.apisecret}
        rules={[{ required: true, message: 'Please enter the API Secret' }]}
      >
        <Input placeholder="Enter API Secret" />
      </Form.Item>

      <Form.Item
        label="API URL"
        name="apiUrl"
        rules={[{ required: true, message: 'Please enter the API URL' }]}
      >
        <Input placeholder="Enter API URL" />
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
  );
};

export default ApiSettingsForm;
