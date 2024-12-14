import React, { useState, useEffect } from 'react';
import { Form, Input, Button, notification, Select } from 'antd';

const { Option } = Select;

const ApiSettingsForm = ({ onApiSubmit, loading }) => {
  let [priceAdjustment, setPriceAdjustment] = useState({priceAdjustmentType:"",priceAdjustmentAmount:""});
  let [turnOff, setTurnOff] = useState(0);
  
  const [formApi] = Form.useForm(); // Form for API settings
  const [formPriceAdjustment] = Form.useForm(); // Form for Price Adjustment settings

  useEffect(() => {
    const fetchPriceAdjustment = async () => {
      try {
        // Use fetch to get data from the API
        const response = await fetch(`/api/get-price-adjustment`);

        if (!response.ok) {
          throw new Error('Error fetching price adjustment data');
        }

        // Parse the response as JSON
        const sample = await response.json();
        const data = sample.data;

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
            description: `No price adjustment settings found for the shop.`,
          });
        }
      } catch (error) {
        notification.error({
          message: 'Error Fetching Data',
          description: error.message || 'An error occurred while fetching the data.',
        });
      }
      setTurnOff(1);
    };
    fetchPriceAdjustment();
  }, [turnOff]);

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

    if (!priceAdjustmentType || priceAdjustmentAmount === undefined) {
      notification.error({
        message: 'Error',
        description: 'Both fields (Price Adjustment Type and Amount) are required.',
      });
      return;
    }

    try {
      priceAdjustment.priceAdjustmentType= priceAdjustmentType
      priceAdjustment.priceAdjustmentAmount= priceAdjustmentAmount

      const response = await fetch(`/api/update-price-adjustment?priceAdjustmentType=${encodeURIComponent(priceAdjustmentType)}&priceAdjustmentAmount=${encodeURIComponent(priceAdjustmentAmount)}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
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
      notification.error({
        message: 'Error',
        description: 'An error occurred while submitting the price adjustment settings.',
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
          <Input placeholder="Enter API Key" />
        </Form.Item>

        <Form.Item
          label="API Secret"
          name="apiSecret"
          rules={[{ required: true, message: 'API Secret is required' }]}>
          <Input placeholder="Enter API Secret" />
        </Form.Item>

        <Form.Item
          label="API URL"
          name="apiUrl"
          rules={[{ required: true, message: 'API URL is required' }]}>
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

      {/* Price Adjustment Form */}
      <h4 className="text-lg font-medium mb-4">Shop Settings</h4>
      <Form
        form={formPriceAdjustment}
        onFinish={handlePriceAdjustmentSubmit}
        layout="vertical"
        requiredMark={false}
        initialValues={{
          priceAdjustmentType: priceAdjustment.priceAdjustmentType,  // Initialize type from state
          priceAdjustmentAmount: priceAdjustment.priceAdjustmentAmount,  // Initialize amount from state
        }}
      >
        <Form.Item
          label="Price Adjustment Type"
          name="priceAdjustmentType"
          rules={[{ required: true, message: 'Please select a price adjustment type' }]}
        >
          <Select
            
            placeholder="Select price adjustment type"
          >
            <Option value="fixed">Fixed</Option>
            <Option value="percentage">Percentage</Option>
          </Select>
        </Form.Item>

        <Form.Item
          label="Price Adjustment Amount"
          name="priceAdjustmentAmount"
          rules={[{ required: true, message: 'Please enter the price adjustment amount' }]}
        >
          <Input
            type="number"
            min={0}
            placeholder="Enter Amount"
            
          />
        </Form.Item>

        <Button
          type="primary"
          htmlType="submit"
          loading={loading}
          className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white"
        >
          Apply Price Adjustment
        </Button>
      </Form>
      <div>
        <strong>Type: </strong>
        <span>
          {priceAdjustment.priceAdjustmentType !== undefined && priceAdjustment.priceAdjustmentType !== null
            ? `${priceAdjustment.priceAdjustmentType}`
            : 'Type not defined '}
        </span>
      </div>
      <div>
        <strong>Amount: </strong>
        <span>
          {priceAdjustment.priceAdjustmentAmount !== undefined && priceAdjustment.priceAdjustmentAmount !== null
            ? `$${priceAdjustment.priceAdjustmentAmount}`
            : 'N/A'}
        </span>
      </div>
      </div>
  );
};

export default ApiSettingsForm;
