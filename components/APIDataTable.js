import React from 'react';
import { Table, Button, notification } from 'antd';

const ApiDataTable = ({ data, loading, onDelete }) => {
  const columns = [
    { title: 'API URL', dataIndex: 'apiUrl', key: 'apiUrl' },
    { title: 'API Key', dataIndex: 'apiKey', key: 'apiKey' },
    { title: 'API Secret', dataIndex: 'apiSecret', key: 'apiSecret' },
    { 
      title: 'Action', 
      key: 'action',
      render: (text, record) => (
        <Button 
          type="primary" 
          danger 
          onClick={() => onDelete(record.id)} // Call delete handler
        >
          Delete
        </Button>
      ),
    },
  ];

  return (
    <div>
      <h4 className="text-lg font-medium mb-4">API Data</h4>
      <Table 
        columns={columns} 
        dataSource={data} 
        rowKey="id" 
        loading={loading} 
      />
    </div>
  );
};

export default ApiDataTable;
