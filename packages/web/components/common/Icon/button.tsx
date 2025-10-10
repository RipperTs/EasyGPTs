import React from 'react';
import { Box } from '@chakra-ui/react';
import MyIcon from './index';
import type { IconNameType } from './type.d';

export default function MyIconButton({
  icon,
  size = '1rem',
  onClick,
  color = 'myGray.600',
  hoverBg,
  hoverColor = 'primary.600',
  p = 2,
  rounded = 'md',
  title
}: {
  icon: IconNameType;
  size?: string | number;
  onClick?: () => void;
  color?: string;
  hoverBg?: string;
  hoverColor?: string;
  p?: any;
  rounded?: any;
  title?: string;
}) {
  return (
    <Box
      as={'button'}
      display={'inline-flex'}
      alignItems={'center'}
      justifyContent={'center'}
      p={p}
      rounded={rounded}
      color={color}
      title={title}
      _hover={{ bg: hoverBg, color: hoverColor }}
      onClick={onClick}
    >
      <MyIcon name={icon} w={size} h={size} />
    </Box>
  );
}
