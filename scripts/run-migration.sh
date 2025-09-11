#!/bin/bash

# 模型配置迁移脚本
# 使用方法：
# 1. 设置环境变量
 export DEFAULT_TEAM_ID="6684f6417abc6abb8792d1bf"
 export DEFAULT_TMB_ID="6684f6417abc6abb8792d1bc"
 export MONGODB_URI="mongodb://myusername:mypassword@10.6.80.35:27017/fastgpt?authSource=admin&directConnection=true"
#
# 2. 运行脚本
# chmod +x scripts/run-migration.sh
# ./scripts/run-migration.sh

echo "开始执行模型配置迁移..."

# 检查环境变量
if [ -z "$DEFAULT_TEAM_ID" ]; then
    echo "错误: 请设置环境变量 DEFAULT_TEAM_ID"
    exit 1
fi

if [ -z "$DEFAULT_TMB_ID" ]; then
    echo "错误: 请设置环境变量 DEFAULT_TMB_ID"
    exit 1
fi

# 默认MongoDB URI
if [ -z "$MONGODB_URI" ]; then
    export MONGODB_URI="mongodb://localhost:27017/fastgpt"
    echo "使用默认MongoDB URI: $MONGODB_URI"
fi

echo "团队ID: $DEFAULT_TEAM_ID"
echo "成员ID: $DEFAULT_TMB_ID"
echo "数据库URI: $MONGODB_URI"

# 检查是否安装了必要的依赖
if ! command -v node &> /dev/null; then
    echo "错误: 未找到 Node.js，请先安装 Node.js"
    exit 1
fi

# 检查json5依赖
if ! node -e "require('json5')" 2>/dev/null; then
    echo "安装必要的依赖..."
    npm install json5 mongodb
fi

# 执行迁移
node scripts/migrate-config-simple.js

echo "迁移完成！"
