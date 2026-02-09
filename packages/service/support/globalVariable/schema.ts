import { Schema, getMongoModel } from '../../common/mongo';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { getPermissionSchema } from '@fastgpt/global/support/permission/utils';
import { GlobalVariableDefaultPermissionVal } from '@fastgpt/global/support/permission/globalVariable/constant';
import { TeamGlobalVariableGroupSchemaType } from '@fastgpt/global/support/globalVariable/type';

export const TeamGlobalVariableGroupCollectionName = 'team_global_variable_groups';

const TeamGlobalVariableGroupSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  tmbId: {
    type: Schema.Types.ObjectId,
    ref: TeamMemberCollectionName,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  groupKey: {
    type: String,
    required: true
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  },
  variables: {
    type: [
      {
        key: {
          type: String,
          required: true
        },
        value: {
          type: String,
          required: true
        }
      }
    ],
    default: []
  },
  ...getPermissionSchema(GlobalVariableDefaultPermissionVal)
});

try {
  TeamGlobalVariableGroupSchema.index({ teamId: 1, groupKey: 1 }, { unique: true });
  TeamGlobalVariableGroupSchema.index({ teamId: 1, updateTime: -1 });
} catch (error) {
  console.log(error);
}

export const MongoTeamGlobalVariableGroup = getMongoModel<TeamGlobalVariableGroupSchemaType>(
  TeamGlobalVariableGroupCollectionName,
  TeamGlobalVariableGroupSchema
);
