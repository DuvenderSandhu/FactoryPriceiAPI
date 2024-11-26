import React, { useState } from 'react';
import { Form, Input, Button, notification } from 'antd';

const ApiSettingsForm = ({ onApiSubmit, loading }) => {
  const [form] = Form.useForm();

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
        form.resetFields(); // Clear the form after successful submission
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

  return (
    <div>
      <h4 className="text-lg font-medium mb-4">API Settings</h4>
      <Form
        form={form}
        onFinish={handleApiSubmit}
        layout="vertical"
        requiredMark={false}
      >
        <Form.Item
          label="API Key"
          name="apiKey"
          rules={[{ required: true, message: 'API Key is required' }]}
        >
          <Input placeholder="Enter API Key" />
        </Form.Item>

        <Form.Item
          label="API Secret"
          name="apiSecret"
          rules={[{ required: true, message: 'API Secret is required' }]}
        >
          <Input placeholder="Enter API Secret" />
        </Form.Item>

        <Form.Item
          label="API URL"
          name="apiUrl"
          rules={[{ required: true, message: 'API URL is required' }]}
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
    </div>
  );
};

export default ApiSettingsForm;
