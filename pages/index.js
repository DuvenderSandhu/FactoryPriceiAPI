import React, { useState } from 'react';
import { Tabs } from 'antd';
import ApiSettingsForm from '../components/ApiSettingsForm';
import EndpointsTab from '../components/Endpoints';
import FileUploadTab from '../components/FileUpload';

const { TabPane } = Tabs;

const PluginIntegrationSettings = () => {
  const [activeTab, setActiveTab] = useState('api-settings');

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-xl shadow-lg">
      <Tabs activeKey={activeTab} onChange={setActiveTab} centered>
        <TabPane tab="API Settings" key="api-settings">
          <ApiSettingsForm  />
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
