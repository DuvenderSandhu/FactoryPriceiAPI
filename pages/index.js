import React, { useState,useEffect } from 'react';
import { Tabs } from 'antd';

import ApiSettingsForm from '../components/APISettingsForm';
import EndpointsTab from '../components/Endpoints';
import FileUploadTab from '../components/FileUpload';

const { TabPane } = Tabs;

const PluginIntegrationSettings = () => {
  const [activeTab, setActiveTab] = useState('api-settings');
  useEffect(() => {
  // Check if the current URL ends with '/auth/null'
  if (window.location.href.endsWith('/auth/null')) {
    // Remove '/auth/null' from the current URL
    const newUrl = window.location.href.replace('/auth/null', '');
    
    // Redirect to the new URL
    window.location.href = newUrl;
  }
}, []);

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-xl shadow-lg">
      <Tabs activeKey={activeTab} onChange={setActiveTab} centered>
        <TabPane tab="API Settings" key="api-settings">
        <ApiSettingsForm/>
        </TabPane>
        <TabPane tab="File Upload" key="file-upload">
          <FileUploadTab />
        </TabPane>
        <TabPane tab="Endpoints" key="endpoints">
          <EndpointsTab />
        </TabPane>
      </Tabs>
    </div>
  );
};

export default PluginIntegrationSettings;
