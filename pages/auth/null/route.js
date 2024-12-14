// pages/404.js

import { Button, Result } from 'antd';
import { useRouter } from 'next/router';

const NotFoundPage = () => {
  const router = useRouter();

  return (
    <div style={{ padding: '50px' }}>
      <Result
        status="404"
        title="404"
        subTitle="Sorry, the page you visited does not exist."
        extra={
          <Button type="primary" onClick={() => router.push('/')}>
            Back to Home
          </Button>
        }
      />
    </div>
  );
};

export default NotFoundPage;
