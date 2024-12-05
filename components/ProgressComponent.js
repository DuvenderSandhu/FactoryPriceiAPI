import React from 'react';
import { Flex, Progress } from 'antd';
function ProgressComponent({percent}){
    return (
        <Flex gap="small" vertical>
    
    <Progress
      percent={percent}
      percentPosition={{
        align: 'center',
        type: 'inner',
      }}
      size={[400, 20]}
    />
    
  </Flex>
  )
}

export default ProgressComponent