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
const DEFAULT_TEAM_ID = process.env.DEFAULT_TEAM_ID;
const DEFAULT_TMB_ID = process.env.DEFAULT_TMB_ID;

async function migrateConfig() {
  try {
    console.log('开始迁移模型配置...');
    
    // 检查环境变量
    if (!DEFAULT_TEAM_ID || !DEFAULT_TMB_ID) {
      console.error('请设置环境变量 DEFAULT_TEAM_ID 和 DEFAULT_TMB_ID');
      process.exit(1);
    }
    
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
    
    // 获取原生MongoDB连接以便直接插入数据
    const db = mongoose.connection.db;
    
    // 迁移LLM模型
    if (config.llmModels && config.llmModels.length > 0) {
      console.log(`开始迁移 ${config.llmModels.length} 个LLM模型...`);
      const llmCollection = db.collection('llm_models');
      
      for (const model of config.llmModels) {
        try {
          const existing = await llmCollection.findOne({
            teamId: new mongoose.Types.ObjectId(DEFAULT_TEAM_ID),
            model: model.model
          });
          
          if (existing) {
            console.log(`LLM模型 ${model.model} 已存在，跳过`);
            continue;
          }
          
          await llmCollection.insertOne({
            teamId: new mongoose.Types.ObjectId(DEFAULT_TEAM_ID),
            tmbId: new mongoose.Types.ObjectId(DEFAULT_TMB_ID),
            model: model.model,
            name: model.name,
            avatar: model.avatar || '/imgs/model/openai.svg',
            maxContext: model.maxContext,
            maxResponse: model.maxResponse,
            quoteMaxToken: model.quoteMaxToken,
            maxTemperature: model.maxTemperature,
            charsPointsPrice: model.charsPointsPrice || 0,
            censor: model.censor || false,
            vision: model.vision || false,
            reasoning: model.reasoning || false,
            datasetProcess: model.datasetProcess || false,
            usedInClassify: model.usedInClassify || false,
            usedInExtractFields: model.usedInExtractFields || false,
            usedInToolCall: model.usedInToolCall || false,
            usedInQueryExtension: model.usedInQueryExtension || false,
            toolChoice: model.toolChoice || false,
            functionCall: model.functionCall || false,
            customCQPrompt: model.customCQPrompt || '',
            customExtractPrompt: model.customExtractPrompt || '',
            defaultSystemChatPrompt: model.defaultSystemChatPrompt || '',
            defaultConfig: model.defaultConfig || {},
            isActive: true,
            createTime: new Date(),
            updateTime: new Date()
          });
          
          console.log(`LLM模型 ${model.model} 迁移成功`);
        } catch (error) {
          console.error(`LLM模型 ${model.model} 迁移失败:`, error.message);
        }
      }
    }
    
    // 迁移重排模型
    if (config.reRankModels && config.reRankModels.length > 0) {
      console.log(`开始迁移 ${config.reRankModels.length} 个重排模型...`);
      const reRankCollection = db.collection('rerank_models');
      
      for (const model of config.reRankModels) {
        try {
          const existing = await reRankCollection.findOne({
            teamId: new mongoose.Types.ObjectId(DEFAULT_TEAM_ID),
            model: model.model
          });
          
          if (existing) {
            console.log(`重排模型 ${model.model} 已存在，跳过`);
            continue;
          }
          
          await reRankCollection.insertOne({
            teamId: new mongoose.Types.ObjectId(DEFAULT_TEAM_ID),
            tmbId: new mongoose.Types.ObjectId(DEFAULT_TMB_ID),
            model: model.model,
            name: model.name,
            charsPointsPrice: model.charsPointsPrice || 0,
            requestUrl: model.requestUrl,
            requestAuth: model.requestAuth,
            isActive: true,
            createTime: new Date(),
            updateTime: new Date()
          });
          
          console.log(`重排模型 ${model.model} 迁移成功`);
        } catch (error) {
          console.error(`重排模型 ${model.model} 迁移失败:`, error.message);
        }
      }
    }
    
    // 迁移TTS模型
    if (config.audioSpeechModels && config.audioSpeechModels.length > 0) {
      console.log(`开始迁移 ${config.audioSpeechModels.length} 个TTS模型...`);
      const ttsCollection = db.collection('tts_models');
      
      for (const model of config.audioSpeechModels) {
        try {
          const existing = await ttsCollection.findOne({
            teamId: new mongoose.Types.ObjectId(DEFAULT_TEAM_ID),
            model: model.model
          });
          
          if (existing) {
            console.log(`TTS模型 ${model.model} 已存在，跳过`);
            continue;
          }
          
          await ttsCollection.insertOne({
            teamId: new mongoose.Types.ObjectId(DEFAULT_TEAM_ID),
            tmbId: new mongoose.Types.ObjectId(DEFAULT_TMB_ID),
            model: model.model,
            name: model.name,
            charsPointsPrice: model.charsPointsPrice || 0,
            voices: model.voices || [],
            isActive: true,
            createTime: new Date(),
            updateTime: new Date()
          });
          
          console.log(`TTS模型 ${model.model} 迁移成功`);
        } catch (error) {
          console.error(`TTS模型 ${model.model} 迁移失败:`, error.message);
        }
      }
    }
    
    // 迁移语音识别模型
    if (config.whisperModel) {
      console.log('开始迁移语音识别模型...');
      const whisperCollection = db.collection('whisper_models');
      
      try {
        const existing = await whisperCollection.findOne({
          teamId: new mongoose.Types.ObjectId(DEFAULT_TEAM_ID),
          model: config.whisperModel.model
        });
        
        if (!existing) {
          await whisperCollection.insertOne({
            teamId: new mongoose.Types.ObjectId(DEFAULT_TEAM_ID),
            tmbId: new mongoose.Types.ObjectId(DEFAULT_TMB_ID),
            model: config.whisperModel.model,
            name: config.whisperModel.name,
            charsPointsPrice: config.whisperModel.charsPointsPrice || 0,
            isActive: true,
            createTime: new Date(),
            updateTime: new Date()
          });
          console.log(`语音识别模型 ${config.whisperModel.model} 迁移成功`);
        } else {
          console.log(`语音识别模型 ${config.whisperModel.model} 已存在，跳过`);
        }
      } catch (error) {
        console.error('语音识别模型迁移失败:', error.message);
      }
    }
    
    // 迁移OCR模型
    if (config.ocrModel) {
      console.log('开始迁移OCR模型...');
      const ocrCollection = db.collection('ocr_models');
      
      try {
        const existing = await ocrCollection.findOne({
          teamId: new mongoose.Types.ObjectId(DEFAULT_TEAM_ID),
          model: config.ocrModel.model
        });
        
        if (!existing) {
          await ocrCollection.insertOne({
            teamId: new mongoose.Types.ObjectId(DEFAULT_TEAM_ID),
            tmbId: new mongoose.Types.ObjectId(DEFAULT_TMB_ID),
            model: config.ocrModel.model,
            name: config.ocrModel.name,
            charsPointsPrice: config.ocrModel.charsPointsPrice || 0,
            requestUrl: config.ocrModel.requestUrl,
            requestAuth: config.ocrModel.requestAuth,
            isActive: true,
            createTime: new Date(),
            updateTime: new Date()
          });
          console.log(`OCR模型 ${config.ocrModel.model} 迁移成功`);
        } else {
          console.log(`OCR模型 ${config.ocrModel.model} 已存在，跳过`);
        }
      } catch (error) {
        console.error('OCR模型迁移失败:', error.message);
      }
    }
    
    // 迁移系统配置
    const systemConfigCollection = db.collection('system_configs');
    const systemConfigs = [
      {
        configKey: 'feConfigs',
        configValue: config.feConfigs || {},
        description: '前端配置'
      },
      {
        configKey: 'systemEnv',
        configValue: config.systemEnv || {},
        description: '系统环境配置'
      },
      {
        configKey: 'vectorModels',
        configValue: config.vectorModels || [],
        description: '向量模型配置'
      }
    ];
    
    for (const sysConfig of systemConfigs) {
      try {
        const existing = await systemConfigCollection.findOne({
          teamId: new mongoose.Types.ObjectId(DEFAULT_TEAM_ID),
          configKey: sysConfig.configKey
        });
        
        if (!existing) {
          await systemConfigCollection.insertOne({
            teamId: new mongoose.Types.ObjectId(DEFAULT_TEAM_ID),
            tmbId: new mongoose.Types.ObjectId(DEFAULT_TMB_ID),
            ...sysConfig,
            isActive: true,
            createTime: new Date(),
            updateTime: new Date()
          });
          console.log(`系统配置 ${sysConfig.configKey} 迁移成功`);
        } else {
          console.log(`系统配置 ${sysConfig.configKey} 已存在，跳过`);
        }
      } catch (error) {
        console.error(`系统配置 ${sysConfig.configKey} 迁移失败:`, error.message);
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