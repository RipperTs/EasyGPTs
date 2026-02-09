export const primaryColor = '#3370FF';
export const lowPrimaryColor = '#94B5FF';

const LEGACY_HANDLE_SIZE = 18;
const HANDLE_SIZE = 28;
const HANDLE_CONNECTED_SIZE = 24;

export const HANDLE_SIZE_COMPENSATION = (HANDLE_SIZE - LEGACY_HANDLE_SIZE) / 2;

export const handleSize = {
  width: `${HANDLE_SIZE}px`,
  height: `${HANDLE_SIZE}px`
};

export const sourceCommonStyle = {
  backgroundColor: 'white',
  borderWidth: '4px',
  borderRadius: '50%'
};
export const handleConnectedStyle = {
  borderColor: lowPrimaryColor,
  width: `${HANDLE_CONNECTED_SIZE}px`,
  height: `${HANDLE_CONNECTED_SIZE}px`
};
export const handleHighLightStyle = {
  borderColor: primaryColor,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: `${HANDLE_SIZE}px`,
  height: `${HANDLE_SIZE}px`
};

export default function Dom() {
  return <></>;
}
