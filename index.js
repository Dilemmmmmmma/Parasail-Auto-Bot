const blessed = require('blessed');
const contrib = require('blessed-contrib');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const ethers = require('ethers');

// 设置控制台输出编码为UTF-8
process.stdout.setEncoding('utf8');
if (process.platform === 'win32') {
  try {
    require('child_process').execSync('chcp 65001', { stdio: 'ignore' });
  } catch (e) {
    // 忽略错误
  }
}

class ParasailNodeBot {
  constructor() {
    this.config = this.loadConfig();
    this.baseUrl = 'https://www.parasail.network/api';
    this.initUI();
    this.completedKeys = new Set(); // 添加已完成私钥的集合
  }

  loadConfig() {
    try {
      const configPath = path.resolve('./config.json');
      const rawConfig = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(rawConfig);
    } catch (error) {
      console.error('Error loading config:', error);
      process.exit(1);
    }
  }

  saveConfig(config) {
    try {
      const configPath = path.resolve('./config.json');
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    } catch (error) {
      this.log(`Error saving config: ${error.message}`);
    }
  }

  getCurrentPrivateKey() {
    // 获取当前私钥
    if (Array.isArray(this.config.privateKeys) && this.config.privateKeys.length > 0) {
      return this.config.privateKeys[this.config.currentKeyIndex];
    } else {
      this.log("Error: No private keys available in config");
      process.exit(1);
    }
  }

  moveToNextKey() {
    // 切换到下一个私钥
    if (!this.config.autoRotateKeys) return;
    
    if (Array.isArray(this.config.privateKeys) && this.config.privateKeys.length > 0) {
      // 记录当前私钥已完成
      this.completedKeys.add(this.config.currentKeyIndex);
      
      // 检查是否所有私钥都已完成
      if (this.completedKeys.size >= this.config.privateKeys.length) {
        this.log(`All keys completed, will start next round after 24.5 hours`);
        // 重置完成集合
        this.completedKeys.clear();
        // 回到第一个私钥
        this.config.currentKeyIndex = 0;
      } else {
        // 正常移动到下一个私钥
        this.config.currentKeyIndex = (this.config.currentKeyIndex + 1) % this.config.privateKeys.length;
      }
      
      this.log(`Switched to next key (index: ${this.config.currentKeyIndex})`);
      this.saveConfig(this.config);
      
      // 重置令牌和钱包地址，以便在下次需要时重新获取
      delete this.config.bearer_token;
      delete this.config.wallet_address;
    }
  }

  async generateSignature() {
    const privateKey = this.getCurrentPrivateKey();
    const wallet = new ethers.Wallet(privateKey);
    const message = `By signing this message, you confirm that you agree to the Parasail Terms of Service.

Parasail (including the website and Parasail smart contracts) are not available for:
(a) access and/or use by Excluded Persons; or
(b) access and/or use by any person or entity that is located in, established in, or a resident of an Excluded Jurisdiction.

Excluded Persons are prohibited from accessing and/or using Parasail (including the website and Parasail smart contracts).

For complete terms, please refer to: https://parasail.network/Parasail_User_Terms.pdf`;
    
    const signature = await wallet.signMessage(message);
    return {
      address: wallet.address,
      msg: message,
      signature
    };
  }

  async verifyUser() {
    try {
      const signatureData = await this.generateSignature();
      
      this.log(`Verifying address: ${signatureData.address}`);
      
      const response = await axios.post(`${this.baseUrl}/user/verify`, signatureData, {
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Content-Type': 'application/json'
        }
      });

      this.config.bearer_token = response.data.token;
      this.config.wallet_address = signatureData.address;
      this.saveConfig(this.config);

      this.log('User verification successful');
      return response.data;
    } catch (error) {
      if (error.response) {
        this.log(`Verification error details:`);
        this.log(`Status: ${error.response.status}`);
        this.log(`Data: ${JSON.stringify(error.response.data)}`);
        this.log(`Headers: ${JSON.stringify(error.response.headers)}`);
      } else if (error.request) {
        this.log(`No response received: ${error.request}`);
      } else {
        this.log(`Error setting up request: ${error.message}`);
      }
      
      throw error;
    }
  }

  initUI() {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'Parasail Auto Bot - Airdrop Insiders',
      fullUnicode: true  // 添加全Unicode支持
    });

    this.layout = blessed.layout({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%'
    });

    this.banner = blessed.box({
      parent: this.layout,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: '{center}{bold}Parasail Auto Bot - Airdrop Insiders{/bold}{/center}',
      tags: true,
      border: 'line',
      style: {
        fg: 'cyan',
        bold: true
      }
    });

    this.logBox = blessed.log({
      parent: this.layout,
      top: 3,
      left: 0,
      width: '70%',
      height: '90%',
      border: 'line',
      style: {
        fg: 'white',
        border: {
          fg: 'white'
        }
      },
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: ' ',
        inverse: true
      }
    });

    this.statsBox = blessed.box({
      parent: this.layout,
      top: 3,
      right: 0,
      width: '30%',
      height: '90%',
      border: 'line',
      style: {
        fg: 'white',
        border: {
          fg: 'white'
        }
      }
    });

    this.countdownBox = blessed.box({
      parent: this.statsBox,
      top: 1,
      left: 1,
      right: 1,
      height: 3,
      content: 'Next Check-in: 24:00:00',
      style: {
        fg: 'white',
        border: {
          fg: 'green'
        }
      }
    });

    this.nodeStatsBox = blessed.box({
      parent: this.statsBox,
      top: 5,
      left: 1,
      right: 1,
      height: '50%',
      content: 'Loading node stats...',
      style: {
        fg: 'white'
      }
    });

    this.keyInfoBox = blessed.box({
      parent: this.statsBox,
      bottom: 3,
      left: 1,
      right: 1,
      height: 3,
      content: `Current Key Index: ${this.config.currentKeyIndex}/${this.config.privateKeys.length - 1}`,
      style: {
        fg: 'yellow'
      }
    });

    this.quitBox = blessed.box({
      parent: this.layout,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
      content: 'Press Q to Quit',
      style: {
        fg: 'white',
        bg: 'gray'
      }
    });

    this.screen.key(['q', 'C-c'], () => {
      return process.exit(0);
    });

    this.screen.render();
  }

  log(message) {
    // 记录到日志文件
    try {
      fs.appendFileSync('bot_log.txt', `${new Date().toISOString()} - ${message}\n`);
    } catch (e) {
      // 忽略错误
    }
    this.logBox.log(message);
    this.screen.render();
  }

  updateNodeStats(stats) {
    const statsContent = [
      `Has Node: ${stats.data.has_node ? 'Yes' : 'No'}`,
      `Node Address: ${stats.data.node_address}`,
      `Points: ${stats.data.points}`,
      `Pending Rewards: ${stats.data.pending_rewards || 'None'}`,
      `Total Distributed: ${stats.data.total_distributed || 'None'}`,
      `Last Check-in: ${stats.data.last_checkin_time 
        ? new Date(stats.data.last_checkin_time * 1000).toLocaleString() 
        : 'None'}`,
      `Card Count: ${stats.data.card_count}`
    ];

    this.nodeStatsBox.setContent(statsContent.join('\n'));
    this.keyInfoBox.setContent(`Current Key Index: ${this.config.currentKeyIndex}/${this.config.privateKeys.length - 1}`);
    this.screen.render();
  }

  async getNodeStats() {
    try {
      const response = await axios.get(`${this.baseUrl}/v1/node/node_stats`, {
        params: { address: this.config.wallet_address },
        headers: {
          'Authorization': `Bearer ${this.config.bearer_token}`,
          'Accept': 'application/json, text/plain, */*'
        }
      });
      return response.data;
    } catch (error) {
      if (error.response && error.response.status === 401) {
        this.log('Token expired. Trying to refresh...');
        await this.verifyUser();
        return this.getNodeStats();
      }

      if (error.response) {
        this.log(`Node stats error details:`);
        this.log(`Status: ${error.response.status}`);
        this.log(`Data: ${JSON.stringify(error.response.data)}`);
        this.log(`Headers: ${JSON.stringify(error.response.headers)}`);
      }
      
      this.log(`Failed to get node stats: ${error.message}`);
      throw error;
    }
  }

  async checkIn() {
    try {
      const checkInResponse = await axios.post(
        `${this.baseUrl}/v1/node/check_in`, 
        { address: this.config.wallet_address },
        {
          headers: {
            'Authorization': `Bearer ${this.config.bearer_token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/plain, */*'
          }
        }
      );

      this.log('Node check-in successful');
      return checkInResponse.data;
    } catch (error) {
      if (error.response && error.response.status === 401) {
        this.log('Token expired. Trying to refresh...');
        await this.verifyUser();
        return this.checkIn();
      }
      
      if (error.response) {
        this.log(`Check-in error details:`);
        this.log(`Status: ${error.response.status}`);
        this.log(`Data: ${JSON.stringify(error.response.data)}`);
        this.log(`Headers: ${JSON.stringify(error.response.headers)}`);
      }
      
      this.log(`Check-in error: ${error.message}`);
      throw error;
    }
  }

  async onboardNode() {
    try {
      const response = await axios.post(`${this.baseUrl}/v1/node/onboard`, 
        { address: this.config.wallet_address },
        {
          headers: {
            'Authorization': `Bearer ${this.config.bearer_token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/plain, */*'
          }
        }
      );

      this.log('Node initialization successful');
      return response.data;
    } catch (error) {
      if (error.response && error.response.status === 401) {
        this.log('Token expired. Trying to refresh...');
        await this.verifyUser();
        return this.onboardNode();
      }
      
      if (error.response) {
        this.log(`Initialization error details:`);
        this.log(`Status: ${error.response.status}`);
        this.log(`Data: ${JSON.stringify(error.response.data)}`);
        this.log(`Headers: ${JSON.stringify(error.response.headers)}`);
      }
      
      this.log(`Initialization error: ${error.message}`);
      throw error;
    }
  }

  startCountdown() {
    // 默认24.5小时 (单位：秒)
    let remainingSeconds = this.completedKeys.size >= this.config.privateKeys.length ? 
                          24.5 * 60 * 60 : 
                          (this.config.checkInterval || 10); 
    
    const countdownInterval = setInterval(() => {
      const hours = Math.floor(remainingSeconds / 3600);
      const minutes = Math.floor((remainingSeconds % 3600) / 60);
      const seconds = remainingSeconds % 60;
      
      const countdownText = `Next Check-in: ${
        hours.toString().padStart(2, '0')
      }:${
        minutes.toString().padStart(2, '0')
      }:${
        seconds.toString().padStart(2, '0')
      }`;
      
      this.countdownBox.setContent(countdownText);
      this.screen.render();
      
      remainingSeconds--;
      
      if (remainingSeconds < 0) {
        clearInterval(countdownInterval);
        this.log('Time to check in!');
        this.performRoutineTasks();
      }
    }, 1000);

    const statsInterval = setInterval(async () => {
      try {
        const stats = await this.getNodeStats();
        this.updateNodeStats(stats);
      } catch (error) {
        this.log(`Failed to update stats: ${error.message}`);
      }
    }, 60000);
  }

  async performRoutineTasks() {
    try {
      await this.onboardNode();
      
      await this.checkIn();
      
      const initialStats = await this.getNodeStats();
      this.updateNodeStats(initialStats);
      
      // 任务完成后，切换到下一个私钥
      this.moveToNextKey();
      
      // 重新启动计时器
      this.startCountdown();
    } catch (error) {
      this.log(`Routine tasks failed: ${error.message}`);
      // 如果失败，尝试使用下一个私钥
      this.log('Trying next key...');
      this.moveToNextKey();
      setTimeout(() => this.performRoutineTasks(), 5000);
    }
  }

  async start() {
    this.log(`Starting Parasail Node Bot`);
    this.log(`Using key index: ${this.config.currentKeyIndex}/${this.config.privateKeys.length - 1}`);
    
    try {
      if (!this.config.bearer_token) {
        await this.verifyUser();
      }

      this.log(`Wallet address: ${this.config.wallet_address}`);

      await this.onboardNode();
      await this.checkIn();
      
      const initialStats = await this.getNodeStats();
      this.updateNodeStats(initialStats);

      this.startCountdown();
    } catch (error) {
      this.log(`Initialization failed: ${error.message}`);
      // 如果初始化失败，尝试使用下一个私钥
      this.log('Trying next key...');
      this.moveToNextKey();
      setTimeout(() => this.start(), 5000);
    }
  }
}

async function main() {
  const nodeBot = new ParasailNodeBot();
  await nodeBot.start();
}

main().catch(error => {
  console.error('Main program error:', error);
});
