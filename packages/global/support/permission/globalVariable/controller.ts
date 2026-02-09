import { PerConstructPros, Permission } from '../controller';
import { GlobalVariableDefaultPermissionVal } from './constant';

export class GlobalVariablePermission extends Permission {
  constructor(props?: PerConstructPros) {
    if (!props) {
      props = {
        per: GlobalVariableDefaultPermissionVal
      };
    } else if (props.per === undefined) {
      props.per = GlobalVariableDefaultPermissionVal;
    }
    super(props);
  }
}
