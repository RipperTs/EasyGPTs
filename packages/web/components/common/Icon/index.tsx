import React, { useEffect, useState } from 'react';
import type { IconProps } from '@chakra-ui/react';
import { Box, Icon } from '@chakra-ui/react';
import { iconPaths } from './constants';
import type { IconNameType } from './type.d';

const MyIcon = ({ name, w = 'auto', h = 'auto', ...props }: { name: IconNameType } & IconProps) => {
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
