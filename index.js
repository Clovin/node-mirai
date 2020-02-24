const Signal = require('./src/utils/Signal');

const init = require('./src/init');
const verify = require('./src/verify');
const release = require('./src/release');
const fetchMessage = require('./src/fetchMessage');

const { sendFriendMessage, sendGroupMessage, sendQuotedFriendMessage, sendQuotedGroupMessage } = require('./src/sendMessage');

class NodeMirai {
  constructor ({
    port = 8080,
    authKey = 'SupreSecureAuthKey',
    qq = 123456,
  }) {
    this.port = port;
    this.authKey = authKey;
    this.qq = qq;
    this.signal = new Signal();
    this.eventListeners = [];
    init(port, authKey).then(data => {
      const { code, session } = data;
      if (code !== 0) {
        console.error('Invalid auth key');
        process.exit(1);
      }
      this.sessionKey = session;
      this.signal.trigger('authed');
      this.startListeningEvents();
    }).catch(() => {
      console.error('Invalid port');
      process.exit(1);
    });
  }
  async verify () {
    return verify(this.port, this.sessionKey, this.qq).then(({ code, msg}) => {
      if (code !== 0) {
        console.error('Invalid session key');
        process.exit(1);
      }
      this.signal.trigger('verified');
      return code;
    });
  }
  async release () {
    return release(this.port, this.sessionKey, this.qq).then(({ code }) => {
      if (code !== 0) return console.error('Invalid session key');
      this.signal.trigger('released');
      return code;
    });
  }
  async fetchMessage (count = 10) {
    return fetchMessage(this.port, this.sessionKey, count);
  }
  async sendFriendMessage (message, target) {
    return sendFriendMessage({
      messageChain: message,
      target,
      sessionKey: this.sessionKey,
      port: this.port,
    });
  }
  async sendGroupMessage (message, target) {
    return sendGroupMessage({
      messageChain: message,
      target,
      sessionKey: this.sessionKey,
      port: this.port,
    });
  }
  async sendMessage (message, target) {
    switch (target.type) {
      case 'FriendMessage':
        this.sendFriendMessage(message, target.sender.id);
        break;
      case 'GroupMessage':
        this.sendGroupMessage(message, target.sender.group.id);
        break;
      default:
        console.error('Invalid target @ sendMessage');
        process.exit(1);
    }
  }
  async sendQuotedFriendMessage (message, target, quote) {
    return sendQuotedFriendMessage({
      messageChain: message,
      target, quote,
      sessionKey: this.sessionKey,
      port: this.port,
    });
  }
  async sendQuotedGroupMessage (message, target, quote) {
    return sendQuotedGroupMessage({
      messageChain: message,
      target, quote,
      sessionKey: this.sessionKey,
      port: this.port,
    });
  }
  async sendQuotedMessage (message, target) {
    try {
      let quote = target.messageChain[0].type === 'Source' ? target.messageChain[0].uid : -1;
      if (quote < 0) throw new Error();
      switch (target.type) {
        case 'FriendMessage':
          this.sendQuotedFriendMessage(message, target.sender.id, quote);
          break;
        case 'GroupMessage':
          this.sendQuotedGroupMessage(message, target.sender.group.id, quote);
          break;
        default:
          console.error('Invalid target @ sendMessage');
          process.exit(1);
      }
    } catch (e) {
      // 无法引用时退化到普通消息
      return this.sendMessage(message, target);
    }
  }
  reply (replyMsg, srcMsg) {
    const replyMessage = [{
      type: 'Plain',
      text: replyMsg,
    }];
    this.sendMessage(replyMessage, srcMsg);
  }
  quoteReply (srcMsg, replyMsg) {}
  onSignal (signalName, callback) {
    this.signal.on(signalName, callback);
  }
  onMessage (callback) {
    this.eventListeners.push(callback);
  }
  listen (type = 'all') {
    this.types = [];
    switch (type) {
      case 'group': this.types.push('GroupMessage'); break;
      case 'friend': this.types.push('FriendMessage'); break;
      case 'all': this.types.push('FriendMessage', 'GroupMessage'); break;
      default:
        console.error('Invalid listen type. Type should be "all", "friend" or "group"');
        process.exit(1);
    }
  }
  startListeningEvents () {
    setInterval(async () => {
      const messages = await this.fetchMessage(10);
      if (messages.length) {
        messages.forEach(message => {
          if (this.types.includes(message.type)) {
            for (let eventListener of this.eventListeners) {
              eventListener(message, this);
            }
          }
        })
      }
    }, 200);
  }
}

module.exports = NodeMirai;