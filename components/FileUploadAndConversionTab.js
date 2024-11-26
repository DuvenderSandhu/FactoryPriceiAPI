import React from 'react';
import { Button, notification } from 'antd';
import FileUpload from './FileUpload';

const FileUploadAndConversionTab = ({ file, handleConvertToCSV }) => {
  return (
    <div>
      <h4 className="text-lg font-medium mb-4">Upload XML and Convert to CSV</h4>

      <div className="mb-4">
        <FileUpload handleFileUpload={(file) => setFile(file)} />
      </div>

      <Button
        type="primary"
        onClick={handleConvertToCSV}
        disabled={!file}
        className="mb-4"
      >
        Convert to CSV
      </Button>
    </div>
  );
};

export default FileUploadAndConversionTab;
