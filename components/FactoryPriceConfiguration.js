import React, { useState, useEffect } from "react";
import {
  Card,
  Button,
  Select,
  Input,
  Spin,
  Table,
  Checkbox,
  notification,
  Modal,
  Row,
  Col,
  Badge,
  Divider, // Added Divider for layout
} from "antd";
import { CheckCircleOutlined, CloseCircleOutlined } from "@ant-design/icons";
import axios from "axios";
import ProductDetails from "./ProductDetails";

const { Option } = Select;

const SyncSettings = () => {
  const [syncMode, setSyncMode] = useState("none");
  const [categories, setCategories] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState(new Set());
  const [productDetails, setProductDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 }); // Custom pagination: 20 products per page
  const [filters, setFilters] = useState({ search: "" });
  const [savedSettings, setSavedSettings] = useState({
    all: false,
    categories: false,
    product_ids: false,
  });
  const [selectedSetting, setSelectedSetting] = useState(null); // Track selected setting

  useEffect(() => {
    fetchInitialSettings();
    fetchCategories();
    fetchProductsAndCategories();
  }, []);

  // Fetch initial sync settings
  const fetchInitialSettings = async () => {
    try {
      const response = await axios.get("/api/get-sync-settings");
      const { syncType, selectedCategories, selectedProductIds } =
        response.data || {};
      setSyncMode(syncType || "none");
      if (syncType === "categories") setSelectedCategories(selectedCategories.split(","));
      if (syncType === "product_ids")
        setSelectedProducts(new Set(selectedProductIds.split(",")));
    } catch (error) {
      console.error("Failed to fetch sync settings:", error);
    }
  };

  // Fetch categories
  const fetchCategories = async () => {
    setLoading(true);
    try {
      const response = await axios.get("/api/get-categories");
      setCategories(response.data.categories || []);
    } catch (error) {
      console.error("Failed to fetch categories:", error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch products
  const fetchProductsAndCategories = async () => {
    setLoading(true);
    try {
      const response = await axios.get("/api/get-products", {
        params: { page: pagination.page, limit: pagination.limit, search: filters.search },
      });
      setProducts(response.data.data || []);
      setPagination(response.data.pagination || { page: 1, limit: 20, total: 0 }); // Use 20 items per page
    } catch (error) {
      console.error("Failed to fetch products:", error);
    } finally {
      setLoading(false);
    }
  };

  // Handle product selection
  const handleSelectProduct = (productId) => {
    setSelectedProducts((prevSelected) => {
      const updatedSet = new Set(prevSelected);
      updatedSet.has(productId) ? updatedSet.delete(productId) : updatedSet.add(productId);
      return updatedSet;
    });
  };

  // Handle product details
  const handleProductDetails = (product) => setProductDetails(product);

  // Save sync settings
  const saveSettings = async (mode) => {
    const payload = {
      syncType: mode,
      selectedCategories: selectedCategories.join(","),
      selectedProductIds: Array.from(selectedProducts).join(","),
    };
    
    // Before the API call, set this setting as active
    setSelectedSetting(mode);

    try {
      await axios.post("/api/update-sync-settings", payload);
      notification.success({ message: "Sync settings saved successfully!" });
      setSavedSettings((prev) => ({ ...prev, [mode]: true }));
    } catch (error) {
      console.error("Failed to save settings:", error);
      notification.error({ message: "Error", description: "Failed to save settings" });
    }
  };

  // Handle page change for products
  const handlePageChange = (page) => {
      console.log("page",page)
    setPagination((prev) => ({ ...prev, page }));
    fetchProductsAndCategories();
  };

  // Handle sync with Shopify
  const handleSyncShopify = async () => {
    setLoading(true);
    try {
      const payload = { syncType: syncMode, selectedCategories, selectedProductIds: Array.from(selectedProducts) };
      const response = await axios.get("/api/sync-shopify", payload);
      notification.success({ message: "Sync Successful", description: response.data.message });
    } catch (error) {
      console.error("Failed to sync with Shopify:", error);
      notification.error({ message: "Sync Failed", description: `Error syncing products: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sync-settings-container">
      {/* Header */}
      <h1 className="sync-header">Factory Price API</h1>

      <Row justify="center">
        <Col xs={24} className="text-right">
          <Button
            onClick={handleSyncShopify}
            type="primary"
            loading={loading}
            className="sync-shopify-btn"
          >
            Sync Products Now
          </Button>
        </Col>
      </Row>

      {/* All Page Section */}
      <div className="mb-6">
        <Card
          title={<span className="sync-title">1. Sync All Products</span>}
          className="sync-card"
          style={{
            border: selectedSetting === "all" ? "1px solid #ddd" : "1px solid #f0f0f0",
            backgroundColor: selectedSetting === "all" ? "#f9fafb" : "white",
          }}
        >
          <p>All products will be synced. No further selection needed.</p>
          <Row justify="end">
            <Button
              type="primary"
              onClick={() => saveSettings("all")}
              disabled={savedSettings.all}
              className="save-btn"
              style={{
                backgroundColor: savedSettings.all ? "#8BC34A" : "#4CAF50",
                borderColor: savedSettings.all ? "#8BC34A" : "#4CAF50",
                color: savedSettings.all ? "#fff" : "#fff",
                position: "relative"
              }}
            >
              {savedSettings.all ? (
                <CheckCircleOutlined />
              ) : (
                <CloseCircleOutlined />
              )}
              {savedSettings.all ? "Active" : "Save Settings"}
              {/* Add Badge inside selected box */}
              {savedSettings.all && (
                <Badge
                  count="Selected"
                  style={{
                    position: "absolute",
                    top: "-5px",
                    right: "-5px",
                    backgroundColor: "#8BC34A",
                    fontSize: "12px",
                  }}
                />
              )}
            </Button>
          </Row>
        </Card>
      </div>

      <Divider  variant="dashed" style={{  borderColor: '#7cb305' }} dashed >Or</Divider>

      {/* Categories Section */}
      <div className="mb-6">
        <Card
          title={<span className="sync-title">2. Select Categories</span>}
          className="sync-card"
          style={{
            border: selectedSetting === "categories" ? "1px solid #ddd" : "1px solid #f0f0f0",
            backgroundColor: selectedSetting === "categories" ? "#f9fafb" : "white",
          }}
        >
          <Select
            mode="multiple"
            value={selectedCategories}
            onChange={setSelectedCategories}
            placeholder="Select categories"
            style={{ width: "100%" }}
            className="sync-select"
          >
            {categories.map((cat, index) => (
              <Option key={index} value={cat}>
                {cat}
              </Option>
            ))}
          </Select>
          <Row justify="end" className="mt-2">
            <Button
              type="primary"
              onClick={() => saveSettings("categories")}
              disabled={savedSettings.categories}
              className="save-btn"
              style={{
                backgroundColor: savedSettings.categories ? "#8BC34A" : "#4CAF50",
                borderColor: savedSettings.categories ? "#8BC34A" : "#4CAF50",
                color: savedSettings.categories ? "#fff" : "#fff",
                position: "relative"
              }}
            >
              {savedSettings.categories ? (
                <CheckCircleOutlined />
              ) : (
                <CloseCircleOutlined />
              )}
              {savedSettings.categories ? "Active" : "Save Settings"}
              {/* Add Badge inside selected box */}
              {savedSettings.categories && (
                <Badge
                  count="Selected"
                  style={{
                    position: "absolute",
                    top: "-5px",
                    right: "-5px",
                    backgroundColor: "#8BC34A",
                    fontSize: "12px",
                  }}
                />
              )}
            </Button>
          </Row>
        </Card>
      </div>

      <Divider  variant="dashed" style={{  borderColor: '#7cb305' }} dashed >Or</Divider>

      {/* Custom Product Selection Section */}
      <div className="mb-6">
        <Card
          title={<span className="sync-title">3. Custom Product Selection</span>}
          className="sync-card"
          style={{
            border: selectedSetting === "product_ids" ? "1px solid #ddd" : "1px solid #f0f0f0",
            backgroundColor: selectedSetting === "product_ids" ? "#f9fafb" : "white",
          }}
        >
          <Row gutter={[16, 16]}>
            <Col xs={18}>
              <Input
                placeholder="Search products"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                onPressEnter={fetchProductsAndCategories}
                className="search-input"
              />
            </Col>
            <Col xs={6} className="text-right">
              <Button
                type="primary"
                onClick={() => saveSettings("product_ids")}
                disabled={savedSettings.product_ids}
                className="save-btn"
                style={{
                  backgroundColor: savedSettings.product_ids ? "#8BC34A" : "#4CAF50",
                  borderColor: savedSettings.product_ids ? "#8BC34A" : "#4CAF50",
                  color: savedSettings.product_ids ? "#fff" : "#fff",
                  position: "relative"
                }}
              >
                {savedSettings.product_ids ? (
                  <CheckCircleOutlined />
                ) : (
                  <CloseCircleOutlined />
                )}
                {savedSettings.product_ids ? "Active" : "Save Settings"}
                {/* Add Badge inside selected box */}
                {savedSettings.product_ids && (
                  <Badge
                    count="Selected"
                    style={{
                      position: "absolute",
                      top: "-5px",
                      right: "-5px",
                      backgroundColor: "#8BC34A",
                      fontSize: "12px",
                    }}
                  />
                )}
              </Button>
            </Col>
          </Row>

          <Spin spinning={loading}>
            <Table
              dataSource={products}
              pagination={{
                current: pagination.page,
                pageSize: pagination.limit,
                total: pagination.total,
                onChange: handlePageChange,
              }}
              rowKey="id"
              columns={[
                {
                  title: "Select",
                  render: (_, record) => (
                    <Checkbox
                      checked={selectedProducts.has(record.id)}
                      onChange={() => handleSelectProduct(record.id)}
                      className="checkbox-selection"
                    />
                  ),
                },
                { title: "Image", dataIndex: "photo_link_small", render: (src) => <img src={src} alt="product" style={{ width: 50 }} /> },
                { title: "Product Name", dataIndex: "model" },
                { title: "Category", dataIndex: "category" },
                { title: "Price", dataIndex: "suggested_price_netto_pln" },
                { title: "Actions", render: (_, record) => <Button onClick={() => handleProductDetails(record)}>Details</Button> },
              ]}
            />
          </Spin>

          <div className="product-count">
            <Badge count={selectedProducts.size} style={{ backgroundColor: "#8BC34A" }} />
            <span>Selected Products</span>
          </div>
        </Card>
      </div>

      {/* Product Details Modal */}
      {productDetails && (
        <Modal
          visible={!!productDetails}
          onCancel={() => setProductDetails(null)}
          title="Product Details"
          footer={null}
        >
          <ProductDetails product={productDetails} />
        </Modal>
      )}
    </div>
  );
};

export default SyncSettings;
