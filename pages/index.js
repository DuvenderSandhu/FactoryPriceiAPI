import React, { useState, useEffect } from "react";
import { Tabs, Button, Checkbox } from "antd";
import Joyride from "react-joyride"; // Import React Joyride

import ApiSettingsForm from "../components/APISettingsForm";
import FileUploadTab from "../components/FileUpload";
import FactoryPriceConfiguration from "../components/FactoryPriceConfiguration";
import Logger from "../components/Logger";

// Commenting out the Endpoints tab as requested
// import EndpointsTab from '../components/Endpoints';
// import SyncSettings from "../components/SyncSettings";

const { TabPane } = Tabs;

const PluginIntegrationSettings = () => {
  const [activeTab, setActiveTab] = useState("api-settings");
  const [showTour, setShowTour] = useState(false);

  const startTour = () => {
    setShowTour(true); // Show the tour when button is clicked
  };

  const tourSteps = [
    // Step for API Settings Tab with user instructions
    {
      target: ".ant-tabs-tab:nth-child(1)", // API Settings Tab
      content: (
        <>
          <h3>API Settings</h3>
          <p>In this step, you will configure your API credentials to connect the application to an external API.</p>
          <ol>
            <li><strong>Step 1:</strong> Enter your <strong>API Key</strong> in the provided input field.</li>
            <li><strong>Step 2:</strong> Enter your <strong>API Secret</strong> in the corresponding input field.</li>
            <li><strong>Step 3:</strong> Provide the <strong>API URL</strong> in the required field.</li>
            <li><strong>Step 4:</strong> Once all fields are completed, click the <strong>"Register API Settings"</strong> button to submit the data.</li>
          </ol>
          <p>If successful, the settings will be saved and a confirmation notification will appear.</p>
        </>
      ),
      placement: "bottom",
    },
    // Step for File Upload Tab with user instructions
    {
      target: ".ant-tabs-tab:nth-child(2)", // File Upload Tab
      content: (
        <>
          <h3>File Upload</h3>
          <p>In this step, you will upload the necessary product files for integration. The process involves several stages:</p>
          <ol>
            <li><strong>Step 1:</strong> Upload the first XML file by selecting <strong>Product File 1</strong> using the file input field. After selecting the file, it will be handled by the upload function.</li>
            <li><strong>Step 2:</strong> Once the first file is selected, click the <strong>"Save Product File (XML 1)"</strong> button. This will trigger the upload of the first XML file, and the button will show a loading spinner during the upload.</li>
            <li><strong>Step 3:</strong> After the first file is uploaded, click the <strong>"Create Products from XML"</strong> button. This will process the XML data to create products from the file.</li>
            <li><strong>Step 4:</strong> Once both XML files are uploaded, click the <strong>"Merge Files"</strong> button. This merges the data from both files into a single structure. The button will be disabled during the merge process.</li>
            <li><strong>Step 5:</strong> If any error occurs during the file upload or merging process, an error message will be shown in red, indicating what went wrong.</li>
            <li><strong>Step 6:</strong> After merging, a table will appear showing the mapped columns (xmlColumns) and the product data. This allows you to view how the data aligns with Shopify's required fields.</li>
            <li><strong>Step 7:</strong> Once the data is ready, click the <strong>"Download CSV"</strong> button to download the processed data in CSV format. The button will be disabled until the mapping is complete.</li>
            <li><strong>Step 8:</strong> If everything is mapped correctly, click the <strong>"Import Products"</strong> button to import the product data into the system. This button is enabled once there are merged data entries.</li>
            <li><strong>Step 9:</strong> Finally, the total number of products to be synced will be displayed below the "Import Products" button, showing how many products will be imported after the process completes.</li>
          </ol>
        </>
      ),
      placement: "bottom",
    },
    // Step for Sync Settings Tab
    {
      target: ".ant-tabs-tab:nth-child(3)", // Sync Settings Tab
      content: (
        <>
          <h3>Sync Settings</h3>
          <p>This tab allows you to configure how products are synchronized with Shopify. You can sync products in different ways:</p>
          <ol>
            <li><strong>Step 1:</strong> Choose the sync mode from the options: <strong>Sync All Products</strong>, <strong>Sync by Categories</strong>, or <strong>Sync by Product IDs</strong>.</li>
            <li><strong>Step 2:</strong> If syncing by categories, select the desired categories and click <strong>"Save Settings"</strong>.</li>
            <li><strong>Step 3:</strong> If syncing by product IDs, search for products and select them from the table. Then click <strong>"Save Settings"</strong>.</li>
            <li><strong>Step 4:</strong> Once your settings are saved, click the <strong>"Sync Products Now"</strong> button to initiate the sync with Shopify.</li>
            <li><strong>Step 5:</strong> After the sync is completed, you’ll receive a success notification.</li>
          </ol>
        </>
      ),
      placement: "bottom",
    },
    {
      target: ".ant-tabs-tab:nth-child(4)", // Logger Tab
      content: (
        <>
          <h3>Logger</h3>
          <p>
            This section shows logs of previous tasks. You can refresh or delete logs as needed.
          </p>
          <ol>
            <li><strong>Step 1:</strong> View logs for task status, errors, or other information.</li>
            <li><strong>Step 2:</strong> Use the "Delete All Logs" button to remove all logs.</li>
            <li><strong>Step 3:</strong> Refresh the logs to get the latest information.</li>
          </ol>
        </>
      ),
    },
  ];

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-xl shadow-lg">
      {/* Button to trigger the tour */}
      <Checkbox checked={showTour} onChange={(e) => e.target.checked && startTour()}>
  Start App Tour
</Checkbox>

      {/* React Joyride component to show the tour */}
      <Joyride
        steps={tourSteps} // Steps for the tour
        continuous={true} // Step-by-step navigation
        showSkipButton={true} // Option to skip the tour
        showProgress={true} // Show progress bar
        scrollToFirstStep={true} // Scroll to the first step
        scrollOffset={50} // Scroll offset for better positioning
        run={showTour} // Start the tour if showTour is true
        callback={({ status }) => {
          if (status === "finished" || status === "skipped") {
            setShowTour(false); // Hide the tour when finished
          }
        }}
        styles={{
          options: {
            width: 900,
            zIndex: 1000,
          }}}
      />

      {/* Tabs */}
      <Tabs activeKey={activeTab} onChange={setActiveTab} centered>
        <TabPane tab="API Settings" key="api-settings">
          <ApiSettingsForm />
        </TabPane>
        <TabPane tab="File Upload" key="file-upload">
          <FileUploadTab />
        </TabPane>
        {/* Commenting out Endpoints tab */}
        {/* <TabPane tab="Endpoints" key="endpoints">
          <EndpointsTab />
        </TabPane> */}
        {/* <TabPane tab="Sync Settings" key="sync-settings">
          <SyncSettings />
        </TabPane> */}
        <TabPane tab="Factory Price Configuration" key="factorypriceconfiguration">
          <FactoryPriceConfiguration />
        </TabPane>
        <TabPane tab="Sync Logs" key="synclog">
          <Logger />
        </TabPane>
      </Tabs>
    </div>
  );
};

export default PluginIntegrationSettings;
