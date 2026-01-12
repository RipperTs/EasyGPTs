import { POST } from '@fastgpt/service/common/api/plusRequest';
import type {
  AuthOutLinkChatProps,
  AuthOutLinkLimitProps,
  AuthOutLinkInitProps,
  AuthOutLinkResponse
} from '@fastgpt/global/support/outLink/api.d';
import { authOutLinkValid } from '@fastgpt/service/support/permission/publish/authLink';
import { getUserChatInfoAndAuthTeamPoints } from '@/service/support/permission/auth/team';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { OutLinkErrEnum } from '@fastgpt/global/common/error/code/outLink';
import { OutLinkSchema } from '@fastgpt/global/support/outLink/type';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { authUserExist } from '@fastgpt/service/support/user/controller';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';

// 分享链接初始化请求身份验证
export function authOutLinkInit(data: AuthOutLinkInitProps): Promise<AuthOutLinkResponse> {
  if (!global.feConfigs?.isPlus) return Promise.resolve({ uid: data.outLinkUid });
  return POST<AuthOutLinkResponse>('/support/outLink/authInit', data);
}
export function authOutLinkChatLimit(data: AuthOutLinkLimitProps): Promise<AuthOutLinkResponse> {
  if (!global.feConfigs?.isPlus) return Promise.resolve({ uid: data.outLinkUid });
  return POST<AuthOutLinkResponse>('/support/outLink/authChatStart', data);
}

async function getLoginUserOutLinkUid(req?: ApiRequestProps<unknown, unknown>): Promise<string> {
  if (!req) return Promise.reject(ERROR_ENUM.unAuthorization);

  const { userId } = await authCert({ req, authToken: true });
  const user = await authUserExist({ userId });
  const username = user?.username;

  if (!username) return Promise.reject(ERROR_ENUM.unAuthorization);
  return username;
}

export async function getOutLinkUidByShareChat({
  req,
  shareChat,
  outLinkUid
}: {
  req?: ApiRequestProps<unknown, unknown>;
  shareChat: OutLinkSchema;
  outLinkUid?: string;
}) {
  if (!shareChat.isLogin) {
    if (!outLinkUid) return Promise.reject(OutLinkErrEnum.linkUnInvalid);
    return outLinkUid;
  }
  return getLoginUserOutLinkUid(req);
}

export const authOutLink = async ({
  req,
  shareId,
  outLinkUid
}: {
  req?: ApiRequestProps<unknown, unknown>;
  shareId?: string;
  outLinkUid?: string;
}): Promise<{
  uid: string;
  appId: string;
  shareChat: OutLinkSchema;
}> => {
  const result = await authOutLinkValid({ shareId });
  const realOutLinkUid = await getOutLinkUidByShareChat({
    req,
    shareChat: result.shareChat,
    outLinkUid
  });

  await authOutLinkInit({ outLinkUid: realOutLinkUid });

  return {
    ...result,
    uid: realOutLinkUid
  };
};

export async function authOutLinkChatStart({
  req,
  shareId,
  ip,
  outLinkUid,
  question
}: AuthOutLinkChatProps & {
  req?: ApiRequestProps<unknown, unknown>;
  shareId: string;
}) {
  // get outLink and app
  const { shareChat, appId } = await authOutLinkValid({ shareId });
  const realOutLinkUid = await getOutLinkUidByShareChat({ req, shareChat, outLinkUid });

  // check ai points and chat limit
  const [{ user }] = await Promise.all([
    getUserChatInfoAndAuthTeamPoints(shareChat.tmbId),
    authOutLinkChatLimit({ outLink: shareChat, ip, outLinkUid: realOutLinkUid, question })
  ]);

  return {
    teamId: shareChat.teamId,
    tmbId: shareChat.tmbId,
    authType: AuthUserTypeEnum.token,
    responseDetail: shareChat.responseDetail,
    user,
    appId,
    uid: realOutLinkUid
  };
}
