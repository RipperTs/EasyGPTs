import { Schema, getMongoModel } from '../../common/mongo';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { getPermissionSchema } from '@fastgpt/global/support/permission/utils';
import { GlobalVariableDefaultPermissionVal } from '@fastgpt/global/support/permission/globalVariable/constant';
import { TeamGlobalVariableSchemaType } from '@fastgpt/global/support/globalVariable/type';

export const TeamGlobalVariableCollectionName = 'team_global_variables';

const TeamGlobalVariableSchema = new Schema({
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
  TeamGlobalVariableSchema.index({ teamId: 1 }, { unique: true });
} catch (error) {
  console.log(error);
}

export const MongoTeamGlobalVariable = getMongoModel<TeamGlobalVariableSchemaType>(
  TeamGlobalVariableCollectionName,
  TeamGlobalVariableSchema
);
