const path = require('path');
const fs = require('fs');

// 动态加载依赖
let mongoose, JSON5;
try {
  // 尝试从项目依赖中加载
  mongoose = require('../node_modules/.pnpm/mongoose@7.7.0/node_modules/mongoose');
  JSON5 = require('../node_modules/.pnpm/json5@2.2.3/node_modules/json5');
} catch (e) {
  try {
    // 回退到全局或本地安装的包
    mongoose = require('mongoose');
    JSON5 = require('json5');
  } catch (e2) {
    console.error('无法加载必要的依赖包。请安装: pnpm add mongoose json5');
    process.exit(1);
  }
}

// 数据库连接配置
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/fastgpt';
const CONFIG_PATH = path.join(__dirname, '../projects/app/data/config.local.json');

// 工具函数：按模型 key 做幂等 upsert
async function upsertOne(collection, query, data) {
  const now = new Date();
  await collection.updateOne(
    query,
    {
      $set: {
        ...data,
        updateTime: now
      },
      $setOnInsert: {
        createTime: now,
        isActive: true
      }
    },
    { upsert: true }
  );
}

async function migrateConfig() {
  try {
    console.log('开始迁移模型配置...');

    // 连接数据库
    await mongoose.connect(MONGODB_URI);
    console.log('数据库连接成功');

    // 读取配置文件
    if (!fs.existsSync(CONFIG_PATH)) {
      console.error(`配置文件不存在: ${CONFIG_PATH}`);
      process.exit(1);
    }

    const configContent = fs.readFileSync(CONFIG_PATH, 'utf8');
    const config = JSON5.parse(configContent);
    console.log('配置文件读取成功');

    // 获取原生MongoDB连接
    const db = mongoose.connection.db;

    // 1) 迁移 LLM 模型（带排序，按 JSON 顺序，sort 从 100 起）
    if (Array.isArray(config.llmModels) && config.llmModels.length > 0) {
      console.log(`开始迁移 ${config.llmModels.length} 个 LLM 模型...`);
      const llmCollection = db.collection('llm_models');
      for (let i = 0; i < config.llmModels.length; i++) {
        const m = config.llmModels[i];
        const sort = 100 + i;
        try {
          await upsertOne(
            llmCollection,
            { model: m.model },
            {
              model: m.model,
              name: m.name,
              avatar: m.avatar || '/imgs/model/openai.svg',
              maxContext: m.maxContext,
              maxResponse: m.maxResponse,
              quoteMaxToken: m.quoteMaxToken,
              maxTemperature: m.maxTemperature,
              charsPointsPrice: m.charsPointsPrice || 0,
              censor: !!m.censor,
              vision: !!m.vision,
              reasoning: !!m.reasoning,
              datasetProcess: !!m.datasetProcess,
              usedInClassify: !!m.usedInClassify,
              usedInExtractFields: !!m.usedInExtractFields,
              usedInToolCall: !!m.usedInToolCall,
              usedInQueryExtension: !!m.usedInQueryExtension,
              toolChoice: !!m.toolChoice,
              functionCall: !!m.functionCall,
              customCQPrompt: m.customCQPrompt || '',
              customExtractPrompt: m.customExtractPrompt || '',
              defaultSystemChatPrompt: m.defaultSystemChatPrompt || '',
              defaultConfig: m.defaultConfig || {},
              sort
            }
          );
          console.log(`LLM模型 ${m.model} 已同步（sort=${sort}）`);
        } catch (error) {
          console.error(`LLM模型 ${m.model} 迁移失败:`, error.message);
        }
      }
    }

    // 2) 迁移向量（Embedding）模型（带排序）
    if (Array.isArray(config.vectorModels) && config.vectorModels.length > 0) {
      console.log(`开始迁移 ${config.vectorModels.length} 个向量模型...`);
      const embeddingCollection = db.collection('embedding_models');
      for (let i = 0; i < config.vectorModels.length; i++) {
        const m = config.vectorModels[i];
        const sort = 100 + i;
        try {
          await upsertOne(
            embeddingCollection,
            { model: m.model },
            {
              model: m.model,
              name: m.name,
              avatar: m.avatar || '/imgs/model/huggingface.svg',
              charsPointsPrice: m.charsPointsPrice || 0,
              defaultToken: m.defaultToken,
              maxToken: m.maxToken,
              weight: m.weight ?? 100,
              defaultConfig: m.defaultConfig || {},
              dbConfig: m.dbConfig || {},
              queryConfig: m.queryConfig || {},
              sort
            }
          );
          console.log(`向量模型 ${m.model} 已同步（sort=${sort}）`);
        } catch (error) {
          console.error(`向量模型 ${m.model} 迁移失败:`, error.message);
        }
      }
    }

    // 3) 迁移重排模型（无排序��段）
    if (Array.isArray(config.reRankModels) && config.reRankModels.length > 0) {
      console.log(`开始迁移 ${config.reRankModels.length} 个重排模型...`);
      const reRankCollection = db.collection('rerank_models');
      for (const m of config.reRankModels) {
        try {
          await upsertOne(
            reRankCollection,
            { model: m.model },
            {
              model: m.model,
              name: m.name,
              charsPointsPrice: m.charsPointsPrice || 0,
              requestUrl: m.requestUrl,
              apiKey: m.apiKey || m.requestAuth // 兼容文件中的 requestAuth 字段
            }
          );
          console.log(`重排模型 ${m.model} 已同步`);
        } catch (error) {
          console.error(`重排模型 ${m.model} 迁移失败:`, error.message);
        }
      }
    }

    // 4) 迁移 TTS 模型（带排序）
    if (Array.isArray(config.audioSpeechModels) && config.audioSpeechModels.length > 0) {
      console.log(`开始迁移 ${config.audioSpeechModels.length} 个 TTS 模型...`);
      const ttsCollection = db.collection('tts_models');
      for (let i = 0; i < config.audioSpeechModels.length; i++) {
        const m = config.audioSpeechModels[i];
        const sort = 100 + i;
        try {
          await upsertOne(
            ttsCollection,
            { model: m.model },
            {
              model: m.model,
              name: m.name,
              avatar: m.avatar || '/imgs/model/tts.svg',
              charsPointsPrice: m.charsPointsPrice || 0,
              requestUrl: m.requestUrl,
              requestHeader: m.requestHeader || {},
              voices: Array.isArray(m.voices) ? m.voices : [],
              defaultConfig: m.defaultConfig || {},
              sort
            }
          );
          console.log(`TTS模型 ${m.model} 已同步（sort=${sort}）`);
        } catch (error) {
          console.error(`TTS模型 ${m.model} 迁移失败:`, error.message);
        }
      }
    }

    // 5) 迁移 Whisper 模型（单条）
    if (config.whisperModel && config.whisperModel.model) {
      console.log('开始迁移语音识别模型...');
      const whisperCollection = db.collection('whisper_models');
      const m = config.whisperModel;
      try {
        await upsertOne(
          whisperCollection,
          { model: m.model },
          {
            model: m.model,
            name: m.name,
            avatar: m.avatar || '/imgs/model/huggingface.svg',
            charsPointsPrice: m.charsPointsPrice || 0,
            requestUrl: m.requestUrl,
            requestHeader: m.requestHeader || {},
            defaultConfig: m.defaultConfig || {}
          }
        );
        console.log(`语音识别模型 ${m.model} 已同步`);
      } catch (error) {
        console.error('语音识别模型迁移失败:', error.message);
      }
    }

    // 6) 迁移 OCR 模型（单条）
    if (config.ocrModel && config.ocrModel.model) {
      console.log('开始迁移 OCR 模型...');
      const ocrCollection = db.collection('ocr_models');
      const m = config.ocrModel;
      try {
        await upsertOne(
          ocrCollection,
          { model: m.model },
          {
            model: m.model,
            name: m.name,
            avatar: m.avatar || '/imgs/model/qwen.svg',
            charsPointsPrice: m.charsPointsPrice || 0,
            requestUrl: m.requestUrl,
            requestHeader: m.requestHeader || {},
            requestAuth: m.requestAuth || '',
            defaultConfig: m.defaultConfig || {}
          }
        );
        console.log(`OCR模型 ${m.model} 已同步`);
      } catch (error) {
        console.error('OCR模型迁移失败:', error.message);
      }
    }

    console.log('模型配置迁移完成！');
  } catch (error) {
    console.error('迁移失败:', error);
    process.exit(1);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
      console.log('数据库连接已关闭');
    }
  }
}

// 运行迁移
if (require.main === module) {
  migrateConfig();
}

module.exports = { migrateConfig };
