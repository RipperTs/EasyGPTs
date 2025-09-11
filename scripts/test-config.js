const path = require('path');

// 动态加载依赖
let mongoose;
try {
  mongoose = require('../node_modules/.pnpm/mongoose@7.7.0/node_modules/mongoose');
} catch (e) {
  try {
    mongoose = require('mongoose');
  } catch (e2) {
    console.error('无法加载mongoose');
    process.exit(1);
  }
}

// 设置环境变量
process.env.MONGODB_URI = process.env.MONGODB_URI || "mongodb://myusername:mypassword@10.6.80.35:27017/fastgpt?authSource=admin&directConnection=true";

async function testConfig() {
  try {
    console.log('开始测试配置读取...');
    
    // 连接数据库
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('数据库连接成功');
    
    const db = mongoose.connection.db;
    
    // 模拟读取配置
    const teamId = "6684f6417abc6abb8792d1bf";
    
    // 读取LLM模型
    const llmModels = await db.collection('llm_models').find({
      teamId: new mongoose.Types.ObjectId(teamId),
      isActive: true
    }).limit(5).toArray();
    
    console.log(`找到 ${llmModels.length} 个LLM模型:`);
    llmModels.forEach(model => {
      console.log(`- ${model.name} (${model.model})`);
    });
    
    // 读取系统配置
    const systemConfigs = await db.collection('system_configs').find({
      teamId: new mongoose.Types.ObjectId(teamId),
      isActive: true
    }).toArray();
    
    console.log(`\n找到 ${systemConfigs.length} 个系统配置:`);
    systemConfigs.forEach(config => {
      console.log(`- ${config.configKey}: ${config.description}`);
    });
    
    // 读取重排模型
    const reRankModels = await db.collection('rerank_models').find({
      teamId: new mongoose.Types.ObjectId(teamId),
      isActive: true
    }).toArray();
    
    console.log(`\n找到 ${reRankModels.length} 个重排模型:`);
    reRankModels.forEach(model => {
      console.log(`- ${model.name} (${model.model})`);
    });
    
    console.log('\n配置读取测试完成！');
    
  } catch (error) {
    console.error('测试失败:', error);
    process.exit(1);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
      console.log('数据库连接已关闭');
    }
  }
}

// 运行测试
if (require.main === module) {
  testConfig();
}

module.exports = { testConfig };