import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';
import { Permission } from '@fastgpt/global/support/permission/controller';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { connectToDatabase } from '@/service/mongo';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();

    const { datasetId } = req.query as { datasetId: string };

    if (!datasetId) {
      return jsonRes(res, {
        code: 500,
        error: '缺少参数'
      });
    }

    const { teamId } = await authDataset({
      req,
      authToken: true,
      datasetId,
      per: 0
    });

    // 获取协作者列表
    const collaborators = await MongoResourcePermission.find({
      resourceType: PerResourceTypeEnum.dataset,
      resourceId: datasetId,
      teamId
    }).lean();

    // 获取协作者信息
    const tmbIds = collaborators.map((item) => item.tmbId);
    const members = await MongoTeamMember.find({
      teamId,
      _id: { $in: tmbIds }
    }).lean();

    // 获取用户头像
    const userIds = members.map((item) => item.userId);
    const users = await MongoUser.find({
      _id: { $in: userIds }
    }).lean();

    // 组合数据
    const result: CollaboratorItemType[] = collaborators.map((item) => {
      const member = members.find((member) => String(member._id) === String(item.tmbId));
      const user = users.find((user) => String(user._id) === String(member?.userId));

      return {
        teamId: String(item.teamId),
        tmbId: String(item.tmbId),
        permission: new Permission({ per: item.permission }),
        name: member?.name || '',
        avatar: user?.avatar || '/icon/user.png' // 从用户表获取头像
      };
    });

    return jsonRes(res, {
      code: 200,
      data: result
    });
  } catch (error) {
    return jsonRes(res, {
      code: 500,
      error
    });
  }
}
