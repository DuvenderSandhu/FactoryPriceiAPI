import React, { useState, useEffect } from 'react';
import { Table, Button, Checkbox, Modal, notification, Form } from 'antd';

const Endpoints = () => {
  const [apiData, setApiData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [responseData, setResponseData] = useState(null);
  const [autoOrdersSync, setAutoOrdersSync] = useState(false);
  const [autoProductsSync, setAutoProductsSync] = useState(false);
  const [lastSync, setLastSync] = useState(null); // Track the last sync

  // Fetch API data on component mount
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

    fetchApiData();
  }, []);

  // Handle API test (per API in table)
  const handleApiTest = async (apiUrl) => {
    setLoading(true);
    try {
      const response = await fetch(apiUrl);
      const result = await response.json();

      if (response.ok) {
        setResponseData({
          status: 'success',
          data: result,
        });
        notification.success({
          message: 'API Test Successful',
          description: result.message || 'API test was successful!',
        });
      } else {
        setResponseData({
          status: 'error',
          data: result,
        });
        notification.error({
          message: 'API Test Failed',
          description: result.message || 'API test failed. Please check your credentials.',
        });
      }
    } catch (error) {
      setResponseData({
        status: 'error',
        data: error,
      });
      notification.error({
        message: 'Test Error',
        description: 'There was an error while testing the API. Please try again later.',
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle Sync Now action
  const handleSyncNow = () => {
    setLoading(true);
    // Simulate sync process with API or backend call
    fetch('/api/syncStock').then(res=>res.text()).then(data=>console.log(data))
    setTimeout(() => {
      setLastSync(new Date().toLocaleString()); // Update last sync time
      setLoading(false);
      notification.success({
        message: 'Sync Completed',
        description: 'The sync has been completed successfully.',
      });
    }, 2000); // Simulate a 2-second sync delay
  };

  // Handle API deletion
  const handleDelete = (apiId) => {
    Modal.confirm({
      title: 'Are you sure?',
      content: 'This will permanently delete the API settings from the database.',
      onOk: async () => {
        setLoading(true);
        try {
          const response = await fetch('/api/deleteAPI', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiId }),
          });
          const result = await response.json();
          if (response.ok) {
            setApiData(apiData.filter((api) => api.id !== apiId));
            notification.success({ message: 'Deleted Successfully', description: result.message });
          } else {
            notification.error({ message: 'Delete Failed', description: result.message });
          }
        } catch (error) {
          notification.error({ message: 'Error', description: 'Failed to delete API settings' });
        } finally {
          setLoading(false);
        }
      },
    });
  };

  // Truncate the URL to 100 characters, appending "..."
  const truncateUrl = (url) => {
    return url.length > 100 ? `${url.substring(0, 100)}...` : url;
  };

  const columns = [
    { title: 'API URL', dataIndex: 'apiurl', key: 'apiurl', render: (text) => truncateUrl(text) },
    { title: 'API Key', dataIndex: 'apikey', key: 'apikey' },
    { title: 'API Secret', dataIndex: 'apiSecret', key: 'apiSecret' },
    {
      title: 'Action',
      key: 'action',
      render: (text, record) => (
        <>
          <Button
            onClick={() => handleApiTest(record.apiurl)}
            type="default"
            loading={loading}
            className="bg-yellow-500 text-white mr-2"
          >
            Test API
          </Button>
          <Button
            onClick={() => handleDelete(record.id)}
            type="primary"
            danger
            className="bg-red-500 text-white"
          >
            Delete
          </Button>
        </>
      ),
    },
  ];

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-xl shadow-lg">
      <h4 className="text-lg font-medium mb-4">API Endpoints</h4>

      {/* Settings for auto sync */}
      <div className="mb-6">
        <h5 className="text-md font-medium mb-2">Settings</h5>
        <Form layout="vertical">
          <Form.Item label="Auto Orders Sync">
            <Checkbox
              checked={autoOrdersSync}
              onChange={(e) => setAutoOrdersSync(e.target.checked)}
            >
              Enable Auto Orders Sync
            </Checkbox>
          </Form.Item>
          <Form.Item label="Auto Products Sync">
            <Checkbox
              checked={autoProductsSync}
              onChange={(e) => setAutoProductsSync(e.target.checked)}
            >
              Enable Auto Products Sync
            </Checkbox>
          </Form.Item>
          <Form.Item>
            <Button
              type="primary"
              onClick={handleSyncNow}
              loading={loading}
              className="bg-blue-500 text-white"
            >
              Sync Now
            </Button>
          </Form.Item>
        </Form>
        {/* Display last sync time */}
        {lastSync && (
          <div className="mt-4">
            <strong>Last Sync:</strong> {lastSync}
          </div>
        )}
      </div>

      {/* API Data Table */}
      <div className="mt-4">
        <Table
          columns={columns}
          dataSource={apiData}
          rowKey="id"
          loading={loading}
          pagination={false}
        />
      </div>

      {/* Show API test result */}
      {responseData && (
        <div className={`mt-6 ${responseData.status === 'success' ? 'bg-green-100' : 'bg-red-100'} p-4 rounded-md`}>
          <h5 className="font-medium">{responseData.status === 'success' ? 'Test Successful' : 'Test Failed'}</h5>
          <pre className="text-sm">{JSON.stringify(responseData.data, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};

export default Endpoints;
