# FastGPT

FastGPT 是一个基于 LLM 大语言模型的知识库问答系统，提供开箱即用的数据处理、模型调用等能力。同时可以通过 Flow 可视化进行工作流编排，从而实现复杂的问答场景！  

这是一个分支版本，增加了一些新特性和优化了性能并解决了很多问题。  

**v4.0版本之后与主分支不兼容， 迁移之前注意备份数据**

## Docker 部署
```bash
# 此分支打包好的镜像
docker pull registry.cn-hangzhou.aliyuncs.com/ripper/easygpts:latest
```

### 完整 Docker Compose

> 镜像全部使用阿里云容器镜像服务， 国内直接拉取可用

**下方配置中部分环境变量的值需要修改成自己的**

```yml
# 首次初始化环境安装 docker-compose -f docker-compose-init.yml up -d

version: '3.3'
services:
  minio:
    container_name: milvus-minio
    image: registry.cn-hangzhou.aliyuncs.com/ripper/minio:RELEASE.2023-03-20T20-16-18Z
    restart: always
    environment:
      MINIO_ACCESS_KEY: minioadmin
      MINIO_SECRET_KEY: minioadmin
    ports:
      - '9001:9001'
      - '9000:9000'
    networks:
      - easygpts
    volumes:
      - ${DOCKER_VOLUME_DIRECTORY:-.}/volumes/minio:/minio_data
    command: minio server /minio_data --console-address ":9001"
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:9000/minio/health/live']
      interval: 30s
      timeout: 20s
      retries: 3
  # milvus
  etcd:
    container_name: milvus-etcd
    image: registry.cn-hangzhou.aliyuncs.com/ripper/etcd:v3.5.5
    environment:
      - ETCD_AUTO_COMPACTION_MODE=revision
      - ETCD_AUTO_COMPACTION_RETENTION=1000
      - ETCD_QUOTA_BACKEND_BYTES=4294967296
      - ETCD_SNAPSHOT_COUNT=50000
    networks:
      - easygpts
    volumes:
      - ${DOCKER_VOLUME_DIRECTORY:-.}/volumes/etcd:/etcd
    command: etcd -advertise-client-urls=http://127.0.0.1:2379 -listen-client-urls http://0.0.0.0:2379 --data-dir /etcd
    healthcheck:
      test: ['CMD', 'etcdctl', 'endpoint', 'health']
      interval: 30s
      timeout: 20s
      retries: 3
  standalone:
    container_name: milvus-standalone
    image: registry.cn-hangzhou.aliyuncs.com/ripper/milvus:v2.4.5
    command: ['milvus', 'run', 'standalone']
    restart: always
    security_opt:
      - seccomp:unconfined
    environment:
      ETCD_ENDPOINTS: etcd:2379
      MINIO_ADDRESS: minio:9000
    networks:
      - easygpts
    volumes:
      - ${DOCKER_VOLUME_DIRECTORY:-.}/volumes/milvus:/var/lib/milvus
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:9091/healthz']
      interval: 30s
      start_period: 90s
      timeout: 20s
      retries: 3
    depends_on:
      - "etcd"
      - "minio"
    ports:
      - "19530:19530"
      - "9091:9091"

  mongo:
    image: registry.cn-hangzhou.aliyuncs.com/fastgpt/mongo:5.0.18 # 阿里云
    container_name: mongo
    restart: always
    ports:
      - 27017:27017
    networks:
      - easygpts
    command: mongod --keyFile /data/mongodb.key --replSet rs0
    environment:
      - MONGO_INITDB_ROOT_USERNAME=myusername
      - MONGO_INITDB_ROOT_PASSWORD=mypassword
    volumes:
      - ./mongo/data:/data/db
    entrypoint:
      - bash
      - -c
      - |
        openssl rand -base64 128 > /data/mongodb.key
        chmod 400 /data/mongodb.key
        chown 999:999 /data/mongodb.key
        echo 'const isInited = rs.status().ok === 1
        if(!isInited){
          rs.initiate({
              _id: "rs0",
              members: [
                  { _id: 0, host: "mongo:27017" }
              ]
          })
        }' > /data/initReplicaSet.js
        # 启动MongoDB服务
        exec docker-entrypoint.sh "$$@" &

        # 等待MongoDB服务启动
        until mongo -u myusername -p mypassword --authenticationDatabase admin --eval "print('waited for connection')" > /dev/null 2>&1; do
          echo "Waiting for MongoDB to start..."
          sleep 2
        done

        # 执行初始化副本集的脚本
        mongo -u myusername -p mypassword --authenticationDatabase admin /data/initReplicaSet.js

        # 等待docker-entrypoint.sh脚本执行的MongoDB服务进程
        wait $$!

  # easygpts
  sandbox:
    container_name: sandbox
    image: registry.cn-hangzhou.aliyuncs.com/ripper/fastgpt-sandbox:latest # 阿里云
    networks:
      - easygpts
    restart: always
    ports:
      - 13801:3000

  easygpts:
    container_name: easygpts
    image: registry.cn-hangzhou.aliyuncs.com/ripper/easygpts:latest # 阿里云
    ports:
      - 3001:3000
    networks:
      - easygpts
    depends_on:
      - mongo
      - standalone
      - sandbox
    restart: always
    environment:
      # root 密码，用户名为: root。如果需要修改 root 密码，直接修改这个环境变量，并重启即可。
      - DEFAULT_ROOT_PSW=<root密码>
      - FE_DOMAIN=http://10.6.80.164
      # AI模型的API地址哦。务必加 /v1。这里默认填写了OneApi的访问地址。
      - OPENAI_BASE_URL=http://10.6.80.35:3800/v1
      # AI模型的API Key。（这里默认填写了OneAPI的快速默认key，测试通后，务必及时修改）
      - CHAT_API_KEY=<秘钥>
      # 数据库最大连接数
      - DB_MAX_LINK=100
      # 登录凭证密钥
      - TOKEN_KEY=<登录凭证>
      # root的密钥，常用于升级时候的初始化请求
      - ROOT_KEY=<root秘钥>
      # 文件阅读加密
      - FILE_TOKEN_KEY=filetokenkey
      # MongoDB 连接参数. 用户名myusername,密码mypassword。
      - MONGODB_URI=mongodb://myusername:mypassword@mongo:27017/fastgpt?authSource=admin&directConnection=true
      # zilliz 连接参数
      - MILVUS_ADDRESS=http://milvus-standalone:19530
      - MILVUS_TOKEN=none
      # sandbox 地址
      - SANDBOX_URL=http://sandbox:3000
      # 日志等级: debug, info, warn, error
      - LOG_LEVEL=warn
      - STORE_LOG_LEVEL=warn
      - XGT_UPDATE_PSW_URL=
    volumes:
      - ./config.json:/app/data/config.json

# Milvus 可视化工具 Attu
  attu:
    container_name: dreamy_northcutt
    image: registry.cn-hangzhou.aliyuncs.com/ripper/attu:latest # 阿里云
    ports:
      - 18000:3000
    networks:
      - easygpts
    restart: always
    environment:
      MILVUS_URL: milvus-standalone:19530

networks:
  easygpts:
```

## 使用协议

本仓库遵循 [FastGPT Open Source License](./LICENSE) 开源协议。

1. 允许作为后台服务直接商用，但不允许提供 SaaS 服务。
2. 未经商业授权，任何形式的商用服务均需保留相关版权信息。
3. 完整请查看 [FastGPT Open Source License](./LICENSE)
