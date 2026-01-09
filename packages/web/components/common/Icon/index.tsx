import React, { useEffect, useState } from 'react';
import type { ChakraProps } from '@chakra-ui/react';
import { Box, Icon } from '@chakra-ui/react';
import { iconPaths } from './constants';
import type { IconNameType } from './type.d';

type MyIconProps = { name: IconNameType } & ChakraProps &
  Omit<React.HTMLAttributes<Element>, keyof ChakraProps> & {
    alt?: string;
  };

const MyIcon = ({ name, w = 'auto', h = 'auto', alt, ...props }: MyIconProps) => {
  const [iconState, setIconState] = useState<
    | null
    | {
        type: 'svg';
        as: React.ElementType;
      }
    | {
        type: 'img';
        src: string;
      }
  >(null);

  useEffect(() => {
    iconPaths[name]?.()
      .then((icon) => {
        const iconDefault = (icon as { default?: unknown }).default;

        if (typeof iconDefault === 'string') {
          setIconState({ type: 'img', src: iconDefault });
          return;
        }

        if (
          iconDefault &&
          typeof iconDefault === 'object' &&
          'src' in iconDefault &&
          typeof (iconDefault as { src?: unknown }).src === 'string'
        ) {
          setIconState({ type: 'img', src: (iconDefault as { src: string }).src });
          return;
        }

        if (typeof iconDefault === 'function' || (iconDefault && typeof iconDefault === 'object')) {
          setIconState({ type: 'svg', as: iconDefault as React.ElementType });
          return;
        }

        setIconState(null);
      })
      .catch((error) => console.log(error));
  }, [name]);

  if (!iconState) return <Box w={w} h={'1px'}></Box>;

  if (iconState.type === 'img') {
    return (
      <Box
        as="img"
        src={iconState.src}
        alt={alt}
        w={w}
        h={h}
        boxSizing={'content-box'}
        verticalAlign={'top'}
        {...props}
      />
    );
  }

  return (
    <Icon
      as={iconState.as}
      w={w}
      h={h}
      boxSizing={'content-box'}
      verticalAlign={'top'}
      fill={'currentcolor'}
      {...props}
    />
  );
};

export default React.memo(MyIcon);
