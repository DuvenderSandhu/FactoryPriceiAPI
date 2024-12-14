import React, { useState, useEffect } from "react";
import {
  Card,
  Button,
  Select,
  Input,
  Spin,
  Modal,
  Table,
  notification,
  Row,
  Col,
  Divider,
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
  const [selectedProducts, setSelectedProducts] = useState(new Set()); // Store selected product IDs
  const [productDetails, setProductDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [filters, setFilters] = useState({ search: "" });
  const [savedSettings, setSavedSettings] = useState({
    all: false,
    categories: false,
    product_ids: false,
  });
  const [selectedSetting, setSelectedSetting] = useState(null);

  useEffect(() => {
    fetchInitialSettings();
    fetchCategories();
    fetchProductsAndCategories();
  }, []);

  // Fetch initial sync settings
  const fetchInitialSettings = async () => {
    try {
      const response = await axios.get("/api/get-sync-settings");
      const { sync_type, selected_categories, selected_product_ids } = response.data || {};
      setSyncMode(sync_type || "none");
      setSelectedSetting(sync_type);

      // If sync_type is "categories", set selected categories
      if (sync_type === "categories" && selected_categories) {
        setSelectedCategories(selected_categories.split(","));
      }

      // If sync_type is "product_ids", set selected products
      if (sync_type === "product_ids" && selected_product_ids) {
        const selectedProductIds = selected_product_ids.split(",").map(id => parseInt(id, 10)); // Convert to numbers
        setSelectedProducts(new Set(selectedProductIds)); // Pre-select products by IDs
      }
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

  // Fetch products with pagination and search
  const fetchProductsAndCategories = async () => {
    setLoading(true);
    try {
      const response = await axios.get("/api/get-products", {
        params: { page: pagination.page, limit: pagination.limit, search: filters.search },
      });
      setProducts(response.data.data || []);
      setPagination(response.data.pagination || { page: 1, limit: 20, total: 0 });
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

  // Save sync settings
  const saveSettings = async (mode) => {
    const payload = {
      syncType: mode,
      selectedCategories: selectedCategories.join(","),
      selectedProductIds: Array.from(selectedProducts).join(","),
    };

    setSelectedSetting(mode);  // Update active setting

    try {
      await axios.get("/api/update-sync-settings", { params: payload });
      notification.success({ message: "Sync settings saved successfully!" });
      setSavedSettings((prev) => ({ ...prev, [mode]: true }));
    } catch (error) {
      console.error("Failed to save settings:", error);
      notification.error({ message: "Error", description: "Failed to save settings" });
    }
  };

  // Handle page change for products
  const handlePageChange = (page) => {
    setPagination((prev) => ({ ...prev, page }));
    fetchProductsAndCategories();
  };

  // Handle sync with Shopify
  const handleSyncShopify = async () => {
    setLoading(true);
    try {
      const payload = { syncType: syncMode, selectedCategories, selectedProductIds: Array.from(selectedProducts) };
      const response = await axios.get("/api/sync-shopify", { params: payload });
      notification.success({ message: "Sync Successful", description: response.data.message });
    } catch (error) {
      console.error("Failed to sync with Shopify:", error);
      notification.error({ message: "Sync Failed", description: `Error syncing products: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  // Handle the product details view
  const handleProductDetails = (record) => {
    setProductDetails(record);
    Modal.info({
      title: 'Product Details',
      content: <ProductDetails product={record} />,
      width: 800,
    });
  };

  // Synchronize selection with the table when the products are updated
  useEffect(() => {
    if (products.length > 0) {
      const preSelectedProductIds = Array.from(selectedProducts);
      const updatedSelections = preSelectedProductIds.filter(id =>
        products.some(product => product.id === id)
      );

      // Only update selectedProducts if the selection has changed
      if (updatedSelections.length !== selectedProducts.size) {
        setSelectedProducts(new Set(updatedSelections));
      }
    }
  }, [products, selectedProducts]); // Sync when products or selectedProducts change

  return (
    <div className="sync-settings-container">
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
            >
              {savedSettings.all ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
              {savedSettings.all ? "Active" : "Save Settings"}
            </Button>
          </Row>
        </Card>
      </div>

      <Divider variant="dashed" style={{ borderColor: '#7cb305' }} dashed >Or</Divider>

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
            >
              {savedSettings.categories ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
              {savedSettings.categories ? "Active" : "Save Settings"}
            </Button>
          </Row>
        </Card>
      </div>

      <Divider variant="dashed" style={{ borderColor: '#7cb305' }} dashed >Or</Divider>

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
                onChange={(e) => setFilters({ search: e.target.value })}
              />
            </Col>
            <Col xs={6}>
              <Button onClick={() => fetchProductsAndCategories()} type="primary">
                Search
              </Button>
            </Col>
          </Row>

          <Table
            rowSelection={{
              selectedRowKeys: Array.from(selectedProducts),
              onChange: (selectedKeys) => setSelectedProducts(new Set(selectedKeys)),
            }}
            rowKey="id"
            columns={[
              {
                title: "Image",
                dataIndex: "photo_link_small",
                render: (src) => <img src={src} alt="product" style={{ width: 50 }} />,
              },
              { title: "Product Name", dataIndex: "model" },
              { title: "Category", dataIndex: "category" },
              { title: "Price", dataIndex: "suggested_price_netto_pln" },
              {
                title: "Actions",
                render: (_, record) => (
                  <Button onClick={() => handleProductDetails(record)}>Details</Button>
                ),
              },
            ]}
            dataSource={products}
            pagination={pagination}
            onChange={handlePageChange}
            loading={loading}
            style={{ marginTop: "20px" }}
          />

          <Row justify="end" className="mt-2">
            <Button
              type="primary"
              onClick={() => saveSettings("product_ids")}
              disabled={savedSettings.product_ids}
              className="save-btn"
            >
              {savedSettings.product_ids ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
              {savedSettings.product_ids ? "Active" : "Save Settings"}
            </Button>
          </Row>
        </Card>
      </div>
    </div>
  );
};

export default SyncSettings;
