import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { request } from 'http';
import { FastGPTProUrl } from '@fastgpt/service/common/system/constants';
import { parse } from 'url';
import { withNextCors } from '@fastgpt/service/common/middle/cors';

// 知识库协作者接口路径
const datasetCollaboratorPaths = [
  'core/dataset/collaborator/list',
  'core/dataset/collaborator/update',
  'core/dataset/collaborator/delete'
];

// 团队成员接口路径
const teamMemberPaths = ['support/user/team/member/list', 'support/user/team/member/create'];

// 用户搜索接口路径
const userSearchPaths = ['support/user/search'];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { path = [], ...query } = req.query as any;
    const pathStr = path?.join('/');
    const requestPath = `/api/${pathStr}?${new URLSearchParams(query).toString()}`;

    // 处理知识库协作者接口
    if (datasetCollaboratorPaths.includes(pathStr)) {
      // 处理CORS
      await withNextCors(req, res);

      // 根据路径加载对应的处理函数
      const pathParts = pathStr.split('/');
      const fileName = pathParts[pathParts.length - 1];

      try {
        // 动态导入对应的处理函数 - 使用显式路径映射避免webpack扫描整个目录
        let handlerModule;
        switch (fileName) {
          case 'list':
            handlerModule = await import('../core/dataset/collaborator/list');
            break;
          case 'update':
            handlerModule = await import('../core/dataset/collaborator/update');
            break;
          case 'delete':
            handlerModule = await import('../core/dataset/collaborator/delete');
            break;
          default:
            throw new Error(`Unknown collaborator handler: ${fileName}`);
        }
        const handler = handlerModule.default;

        if (typeof handler !== 'function') {
          throw new Error(`Handler for ${fileName} is not a function`);
        }

        return handler(req, res);
      } catch (error) {
        console.error(`Error loading handler for ${fileName}:`, error);
        return jsonRes(res, {
          code: 500,
          error: `Failed to load handler for ${fileName}`
        });
      }
    }

    // 处理团队成员接口
    if (teamMemberPaths.includes(pathStr)) {
      // 处理CORS
      await withNextCors(req, res);

      try {
        // 动态导入对应的处理函数 - 使用显式路径映射
        let handlerModule;
        if (pathStr === 'support/user/team/member/list') {
          handlerModule = await import('../support/user/team/member/list');
        } else if (pathStr === 'support/user/team/member/create') {
          handlerModule = await import('../support/user/team/member/create');
        } else {
          throw new Error(`Unknown team member handler: ${pathStr}`);
        }
        const handler = handlerModule.default;

        if (typeof handler !== 'function') {
          throw new Error(`Handler for ${pathStr} is not a function`);
        }

        return handler(req, res);
      } catch (error) {
        console.error(`Error loading handler for ${pathStr}:`, error);
        return jsonRes(res, {
          code: 500,
          error: `Failed to load handler for ${pathStr}`
        });
      }
    }

    // 处理用户搜索接口
    if (userSearchPaths.includes(pathStr)) {
      // 处理CORS
      await withNextCors(req, res);

      try {
        // 动态导入对应的处理函数 - 使用显式路径映射
        let handlerModule;
        if (pathStr === 'support/user/search') {
          handlerModule = await import('../support/user/search');
        } else {
          throw new Error(`Unknown user search handler: ${pathStr}`);
        }
        const handler = handlerModule.default;

        if (typeof handler !== 'function') {
          throw new Error(`Handler for ${pathStr} is not a function`);
        }

        return handler(req, res);
      } catch (error) {
        console.error(`Error loading handler for ${pathStr}:`, error);
        return jsonRes(res, {
          code: 500,
          error: `Failed to load handler for ${pathStr}`
        });
      }
    }

    if (!requestPath) {
      throw new Error('url is empty');
    }
    if (!FastGPTProUrl) {
      throw new Error('暂不支持.');
    }

    const parsedUrl = new URL(FastGPTProUrl);
    delete req.headers?.rootkey;

    const requestResult = request({
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: requestPath,
      method: req.method,
      headers: req.headers
    });
    req.pipe(requestResult);

    requestResult.on('response', (response) => {
      Object.keys(response.headers).forEach((key) => {
        // @ts-ignore
        res.setHeader(key, response.headers[key]);
      });
      response.statusCode && res.writeHead(response.statusCode);
      response.pipe(res);
    });

    requestResult.on('error', (e) => {
      res.send(e);
      res.end();
    });
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};
