import React, { useState, useEffect } from "react";
import { Button, notification } from "antd";
import axios from "axios";

const Logger = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false); // State for delete loading
const fetchLogs = async () => {
      try {
          setLoading(true)
        const response = await axios.get("/api/logs");
        setLogs(response.data.logs);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching logs:", error);
        setLoading(false);
        notification.error({
          message: "Error",
          description: "Failed to fetch logs. Please try again later.",
        });
      }
    };
  // Fetch logs from API on component mount
  useEffect(() => {
    

    fetchLogs();
  }, []);

  const handleDeleteLogs = async () => {
    setDeleting(true);
    try {
      const response = await axios.delete("/api/logs");
      if (response.status === 200) {
        setLogs([]); // Clear logs after deletion
        notification.success({
          message: "Success",
          description: "Logs deleted successfully!",
        });
      }
    } catch (error) {
      console.error("Error deleting logs:", error);
      notification.error({
        message: "Error",
        description: "Failed to delete logs. Please try again later.",
      });
    } finally {
      setDeleting(false); // Stop loading after deletion attempt
    }
  };

  const renderLog = (log) => {
    return (
      <div key={log.id} className="text-sm mb-2 whitespace-pre-wrap">
        <span className={`font-bold ${log.level === "error" ? "text-red-400" : "text-green-400"}`}>
          [{log.timestamp}] {log.level.toUpperCase()}:
        </span>
        <span className="ml-2">{log.message}</span>
        {log.error_message && (
          <div className="text-red-400 mt-1">Error Details: {log.error_message}</div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-900 flex justify-center items-center">
      <div className="w-full max-w-7xl p-4 bg-black text-green-400 rounded-xl shadow-xl overflow-auto">
        <div className="text-2xl mb-4">
          <span>Task Logger - Logs</span>
        </div>

        {/* Display loading state */}
        {loading ? (
          <div className="text-white">Loading logs...</div>
        ) : logs.length === 0 ? (
          <div className="text-white">No logs found for this shop.</div>
        ) : (
          <div className="h-96 min-h-[400px] overflow-y-auto p-2">
            {/* Render logs */}
            {logs.map((log) => renderLog(log))}
          </div>
        )}

        {/* Delete Logs Button */}
        <Button
          type="danger"
          className="w-full bg-red-500 text-black hover:bg-red-600 mt-4"
          onClick={handleDeleteLogs}
          loading={deleting} // Show loading indicator during deletion
        >
          Delete All Logs
        </Button>

        {/* Refresh Button */}
        <Button
          type="primary"
          className="w-full bg-green-400 text-black hover:bg-green-500 mt-4"
          onClick={ () => {
            fetchLogs()
          }}
        >
          Refresh Logs
        </Button>
      </div>
    </div>
  );
};

export default Logger;
