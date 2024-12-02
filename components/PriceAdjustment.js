import React, { useState } from 'react';
import { Input, Select, Button, Row, Col } from 'antd';

const PriceAdjustment = () => {
  const [priceType, setPriceType] = useState('fixed'); // 'fixed' or 'percentage'
  const [priceValue, setPriceValue] = useState('');
  const [adjustedPrice, setAdjustedPrice] = useState(null);

  const handlePriceChange = (e) => {
    setPriceValue(e.target.value);
  };

  const handlePriceTypeChange = (value) => {
    setPriceType(value);
  };

  const calculatePrice = () => {
    // Example initial price, this should come from your product data
    const initialPrice = 100; 

    let newPrice = initialPrice;
    if (priceType === 'fixed') {
      newPrice += parseFloat(priceValue);
    } else if (priceType === 'percentage') {
      newPrice += (initialPrice * parseFloat(priceValue)) / 100;
    }
    
    setAdjustedPrice(newPrice);
  };

  return (
    <div style={{ padding: '20px', border: '1px solid #ddd', borderRadius: '8px' }}>
      <Row gutter={16}>
        <Col span={12}>
          <label>Select Price Adjustment Type:</label>
          <Select 
            value={priceType}
            onChange={handlePriceTypeChange} 
            style={{ width: '100%' }}
          >
            <Select.Option value="fixed">Fixed Amount</Select.Option>
            <Select.Option value="percentage">Percentage</Select.Option>
          </Select>
        </Col>
        <Col span={12}>
          <label>Enter Value:</label>
          <Input
            value={priceValue}
            onChange={handlePriceChange}
            placeholder={priceType === 'fixed' ? 'Enter Amount' : 'Enter Percentage'}
            type="number"
          />
        </Col>
      </Row>
      <Button 
        type="primary" 
        onClick={calculatePrice} 
        style={{ marginTop: '20px' }}
      >
        Adjust Price
      </Button>
      
      {adjustedPrice !== null && (
        <div style={{ marginTop: '20px' }}>
          <p>Initial Price: $100</p>
          <p>
            Adjusted Price: ${adjustedPrice.toFixed(2)}
          </p>
        </div>
      )}
    </div>
  );
};

export default PriceAdjustment;
