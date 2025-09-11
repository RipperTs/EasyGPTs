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
    console.error('无法加载必要的依赖包。请确保已安装 mongoose 和 json5');
    console.error('运行: npm install mongoose json5');
    process.exit(1);
  }
}

// 数据库连接配置
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/fastgpt';

// 配置文件路径
const CONFIG_PATH = path.join(__dirname, '../projects/app/data/config.local.json');

// 默认团队信息（这里需要根据实际情况调整）
const DEFAULT_TEAM_ID = process.env.DEFAULT_TEAM_ID;
const DEFAULT_TMB_ID = process.env.DEFAULT_TMB_ID;

// 定义Schema
const llmModelSchema = new mongoose.Schema({
  teamId: { type: mongoose.Schema.Types.ObjectId, required: true },
  tmbId: { type: mongoose.Schema.Types.ObjectId, required: true },
  model: { type: String, required: true },
  name: { type: String, required: true },
  avatar: { type: String, default: '/imgs/model/openai.svg' },
  maxContext: { type: Number, required: true },
  maxResponse: { type: Number, required: true },
  quoteMaxToken: { type: Number, required: true },
  maxTemperature: { type: Number, required: true },
  charsPointsPrice: { type: Number, default: 0 },
  censor: { type: Boolean, default: false },
  vision: { type: Boolean, default: false },
  reasoning: { type: Boolean, default: false },
  datasetProcess: { type: Boolean, default: false },
  usedInClassify: { type: Boolean, default: false },
  usedInExtractFields: { type: Boolean, default: false },
  usedInToolCall: { type: Boolean, default: false },
  usedInQueryExtension: { type: Boolean, default: false },
  toolChoice: { type: Boolean, default: false },
  functionCall: { type: Boolean, default: false },
  customCQPrompt: { type: String, default: '' },
  customExtractPrompt: { type: String, default: '' },
  defaultSystemChatPrompt: { type: String, default: '' },
  defaultConfig: { type: Object, default: {} },
  isActive: { type: Boolean, default: true },
  createTime: { type: Date, default: Date.now },
  updateTime: { type: Date, default: Date.now }
});

const reRankModelSchema = new mongoose.Schema({
  teamId: { type: mongoose.Schema.Types.ObjectId, required: true },
  tmbId: { type: mongoose.Schema.Types.ObjectId, required: true },
  model: { type: String, required: true },
  name: { type: String, required: true },
  charsPointsPrice: { type: Number, default: 0 },
  requestUrl: { type: String, required: true },
  requestAuth: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  createTime: { type: Date, default: Date.now },
  updateTime: { type: Date, default: Date.now }
});

const ttsModelSchema = new mongoose.Schema({
  teamId: { type: mongoose.Schema.Types.ObjectId, required: true },
  tmbId: { type: mongoose.Schema.Types.ObjectId, required: true },
  model: { type: String, required: true },
  name: { type: String, required: true },
  charsPointsPrice: { type: Number, default: 0 },
  voices: { type: Array, default: [] },
  isActive: { type: Boolean, default: true },
  createTime: { type: Date, default: Date.now },
  updateTime: { type: Date, default: Date.now }
});

const whisperModelSchema = new mongoose.Schema({
  teamId: { type: mongoose.Schema.Types.ObjectId, required: true },
  tmbId: { type: mongoose.Schema.Types.ObjectId, required: true },
  model: { type: String, required: true },
  name: { type: String, required: true },
  charsPointsPrice: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createTime: { type: Date, default: Date.now },
  updateTime: { type: Date, default: Date.now }
});

const ocrModelSchema = new mongoose.Schema({
  teamId: { type: mongoose.Schema.Types.ObjectId, required: true },
  tmbId: { type: mongoose.Schema.Types.ObjectId, required: true },
  model: { type: String, required: true },
  name: { type: String, required: true },
  charsPointsPrice: { type: Number, default: 0 },
  requestUrl: { type: String, required: true },
  requestAuth: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  createTime: { type: Date, default: Date.now },
  updateTime: { type: Date, default: Date.now }
});

const systemConfigSchema = new mongoose.Schema({
  teamId: { type: mongoose.Schema.Types.ObjectId, required: true },
  tmbId: { type: mongoose.Schema.Types.ObjectId, required: true },
  configKey: { type: String, required: true },
  configValue: { type: Object, required: true },
  description: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  createTime: { type: Date, default: Date.now },
  updateTime: { type: Date, default: Date.now }
});

// 创建模型
const LLMModel = mongoose.model('llm_models', llmModelSchema);
const ReRankModel = mongoose.model('rerank_models', reRankModelSchema);
const TTSModel = mongoose.model('tts_models', ttsModelSchema);
const WhisperModel = mongoose.model('whisper_models', whisperModelSchema);
const OCRModel = mongoose.model('ocr_models', ocrModelSchema);
const SystemConfig = mongoose.model('system_configs', systemConfigSchema);

async function migrateModelConfig() {
  try {
    console.log('开始迁移模型配置...');
    
    // 检查必要的环境变量
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
    
    // 迁移LLM模型配置
    if (config.llmModels && config.llmModels.length > 0) {
      console.log(`开始迁移 ${config.llmModels.length} 个 LLM 模型...`);
      
      for (const model of config.llmModels) {
        try {
          // 检查是否已存在
          const existing = await LLMModel.findOne({
            teamId: DEFAULT_TEAM_ID,
            model: model.model
          });
          
          if (existing) {
            console.log(`LLM模型 ${model.model} 已存在，跳过`);
            continue;
          }
          
          const modelData = new LLMModel({
            teamId: DEFAULT_TEAM_ID,
            tmbId: DEFAULT_TMB_ID,
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
            defaultConfig: model.defaultConfig || {}
          });
          
          await modelData.save();
          console.log(`LLM模型 ${model.model} 迁移成功`);
        } catch (error) {
          console.error(`LLM模型 ${model.model} 迁移失败:`, error.message);
        }
      }
    }
    
    // 迁移重排模型配置
    if (config.reRankModels && config.reRankModels.length > 0) {
      console.log(`开始迁移 ${config.reRankModels.length} 个重排模型...`);
      
      const reRankCollection = db.collection('rerank_models');
      
      for (const model of config.reRankModels) {
        try {
          const modelData = {
            teamId: DEFAULT_TEAM_ID,
            tmbId: DEFAULT_TMB_ID,
            model: model.model,
            name: model.name,
            charsPointsPrice: model.charsPointsPrice || 0,
            requestUrl: model.requestUrl,
            requestAuth: model.requestAuth,
            isActive: true,
            createTime: new Date(),
            updateTime: new Date()
          };
          
          const existing = await reRankCollection.findOne({
            teamId: DEFAULT_TEAM_ID,
            model: model.model
          });
          
          if (existing) {
            console.log(`重排模型 ${model.model} 已存在，跳过`);
            continue;
          }
          
          await reRankCollection.insertOne(modelData);
          console.log(`重排模型 ${model.model} 迁移成功`);
        } catch (error) {
          console.error(`重排模型 ${model.model} 迁移失败:`, error.message);
        }
      }
    }
    
    // 迁移TTS模型配置
    if (config.audioSpeechModels && config.audioSpeechModels.length > 0) {
      console.log(`开始迁移 ${config.audioSpeechModels.length} 个TTS模型...`);
      
      const ttsCollection = db.collection('tts_models');
      
      for (const model of config.audioSpeechModels) {
        try {
          const modelData = {
            teamId: DEFAULT_TEAM_ID,
            tmbId: DEFAULT_TMB_ID,
            model: model.model,
            name: model.name,
            charsPointsPrice: model.charsPointsPrice || 0,
            voices: model.voices || [],
            isActive: true,
            createTime: new Date(),
            updateTime: new Date()
          };
          
          const existing = await ttsCollection.findOne({
            teamId: DEFAULT_TEAM_ID,
            model: model.model
          });
          
          if (existing) {
            console.log(`TTS模型 ${model.model} 已存在，跳过`);
            continue;
          }
          
          await ttsCollection.insertOne(modelData);
          console.log(`TTS模型 ${model.model} 迁移成功`);
        } catch (error) {
          console.error(`TTS模型 ${model.model} 迁移失败:`, error.message);
        }
      }
    }
    
    // 迁移语音识别模型配置
    if (config.whisperModel) {
      console.log('开始迁移语音识别模型...');
      
      const whisperCollection = db.collection('whisper_models');
      
      try {
        const modelData = {
          teamId: DEFAULT_TEAM_ID,
          tmbId: DEFAULT_TMB_ID,
          model: config.whisperModel.model,
          name: config.whisperModel.name,
          charsPointsPrice: config.whisperModel.charsPointsPrice || 0,
          isActive: true,
          createTime: new Date(),
          updateTime: new Date()
        };
        
        const existing = await whisperCollection.findOne({
          teamId: DEFAULT_TEAM_ID,
          model: config.whisperModel.model
        });
        
        if (!existing) {
          await whisperCollection.insertOne(modelData);
          console.log(`语音识别模型 ${config.whisperModel.model} 迁移成功`);
        } else {
          console.log(`语音识别模型 ${config.whisperModel.model} 已存在，跳过`);
        }
      } catch (error) {
        console.error('语音识别模型迁移失败:', error.message);
      }
    }
    
    // 迁移OCR模型配置
    if (config.ocrModel) {
      console.log('开始迁移OCR模型...');
      
      const ocrCollection = db.collection('ocr_models');
      
      try {
        const modelData = {
          teamId: DEFAULT_TEAM_ID,
          tmbId: DEFAULT_TMB_ID,
          model: config.ocrModel.model,
          name: config.ocrModel.name,
          charsPointsPrice: config.ocrModel.charsPointsPrice || 0,
          requestUrl: config.ocrModel.requestUrl,
          requestAuth: config.ocrModel.requestAuth,
          isActive: true,
          createTime: new Date(),
          updateTime: new Date()
        };
        
        const existing = await ocrCollection.findOne({
          teamId: DEFAULT_TEAM_ID,
          model: config.ocrModel.model
        });
        
        if (!existing) {
          await ocrCollection.insertOne(modelData);
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
          teamId: DEFAULT_TEAM_ID,
          configKey: sysConfig.configKey
        });
        
        if (!existing) {
          await systemConfigCollection.insertOne({
            teamId: DEFAULT_TEAM_ID,
            tmbId: DEFAULT_TMB_ID,
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
    if (client) {
      await client.close();
      console.log('数据库连接已关闭');
    }
  }
}

// 运行迁移
if (require.main === module) {
  migrateModelConfig();
}

module.exports = { migrateModelConfig };