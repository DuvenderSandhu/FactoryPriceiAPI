import React from 'react';
import { Descriptions, Image, Typography } from 'antd';

const { Title, Paragraph } = Typography;

const ProductDetails = ({ product }) => {
  if (!product) {
    return null;
  }

  return (
    <div className="product-details">
      {/* Product Title */}
      <Title level={4}>{product.model || 'Unnamed Product'}</Title>

      {/* Product Images */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        {product.photo_link_large && (
          <Image
            width={150}
            src={product.photo_link_large}
            alt="Large Product"
            style={{ border: '1px solid #ddd', borderRadius: 8 }}
          />
        )}
        {product.photo_link_small && (
          <Image
            width={100}
            src={product.photo_link_small}
            alt="Small Product"
            style={{ border: '1px solid #ddd', borderRadius: 8 }}
          />
        )}
      </div>

      {/* Product Details Table */}
      <Descriptions bordered column={2} size="small">
        <Descriptions.Item label="Model ID">{product.ModelID || 'N/A'}</Descriptions.Item>
        <Descriptions.Item label="Color">{product.color || 'N/A'}</Descriptions.Item>
        <Descriptions.Item label="Gender">{product.gender || 'Unisex'}</Descriptions.Item>
        <Descriptions.Item label="Category">{product.category || 'N/A'}</Descriptions.Item>
        <Descriptions.Item label="Producer">{product.producer || 'N/A'}</Descriptions.Item>
        <Descriptions.Item label="VAT">{product.vat ? `${product.vat}%` : 'N/A'}</Descriptions.Item>
        <Descriptions.Item label="Suggested Price">
          {product.suggested_price_netto_pln
            ? `${product.suggested_price_netto_pln} PLN`
            : 'N/A'}
        </Descriptions.Item>
        <Descriptions.Item label="Wholesale Price">
          {product.wholesale_price_netto_pln
            ? `${product.wholesale_price_netto_pln} PLN`
            : 'N/A'}
        </Descriptions.Item>
      </Descriptions>

      {/* Additional Information */}
      <div style={{ marginTop: '1rem' }}>
        <Title level={5}>Material Composition</Title>
        <Paragraph>
          {product.material_composition || 'No details available.'}
        </Paragraph>

        <Title level={5}>Washing Recipe</Title>
        <Paragraph>
          {product.washing_recipe || 'No washing instructions provided.'}
        </Paragraph>

        <Title level={5}>Size Chart</Title>
        <Paragraph>
          {product.sizechart || 'No size chart available.'}
        </Paragraph>

        <Title level={5}>Description</Title>
        <Paragraph>
          {product.description || 'No description available.'}
        </Paragraph>

        <Title level={5}>Variants</Title>
        <Paragraph>
          {product.variants || 'No variants specified.'}
        </Paragraph>
      </div>
    </div>
  );
};

export default ProductDetails;
