import { Env } from '../env';

interface ClientEntry {
  sessionId: string;
  userId: string;
  name: string;
  hue: number;
  lastActive: number;
}

export class NetworkRoomDO {
  ctx: DurableObjectState;
  env: Env;
  PROTOCOL_VERSION = 8;
  SSIDtoID: Map<string, string> = new Map();
  IDToName: Map<string, string> = new Map();
  IDtoClient: Map<string, ClientEntry> = new Map();
  nameToClient: Map<string, ClientEntry> = new Map();
  nameToHue: Map<string, number> = new Map();
  loggedMessages: Array<[string, number]> = [];

  constructor(state: DurableObjectState, env: Env) {
    this.ctx = state;
    this.env = env;

    this.ctx.blockConcurrencyWhile(async () => {
      const msgs = await this.ctx.storage.get<Array<[string, number]>>('loggedMessages');
      if (msgs) this.loggedMessages = msgs;
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/ws') {
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (path === '/action/logToAll') {
      const body = await request.json<{ content: string }>();
      await this.logToAll(body.content);
      return Response.json({ ok: true });
    }

    if (path === '/action/notifyPlayer') {
      const body = await request.json<{ toId: string; content: string }>();
      this.notifyPlayer(body.toId, body.content);
      return Response.json({ ok: true });
    }

    if (path === '/action/sendDiscord') {
      const body = await request.json<{ content: string }>();
      await this.sendToDiscord(body.content);
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, rawMsg: string | ArrayBuffer) {
    try {
      const msg = typeof rawMsg === 'string' ? JSON.parse(rawMsg) : JSON.parse(new TextDecoder().decode(rawMsg));
      const sessionId = (ws as any).__sessionId || '';

      switch (msg.type) {
        case 'auth': {
          const result = await this.handleAuth(ws, msg.data);
          if (!result.ok) {
            ws.send(JSON.stringify({ type: 'error', data: result.error }));
            ws.close(result.code || 4001, result.error);
          }
          break;
        }
        case 'chat': {
          const entry = this.IDtoClient.get(this.SSIDtoID.get(sessionId) || '');
          if (!entry) {
            this.removePlayer(sessionId);
            return;
          }

          let message: string = msg.data;
          if (!message || message.length > 300) return;
          message = message.trim();
          if (message.length <= 0) return;

          const sender = entry.name;

          // DM
          if (message.startsWith('>')) {
            const msgSplit = message.split(' ');
            const targetName = msgSplit[0].substring(1);
            msgSplit.shift();
            const dmMsg = msgSplit.join(' ');
            if (dmMsg.length <= 0) return;

            const targetEntry = this.nameToClient.get(targetName.toLowerCase());
            if (targetEntry) {
              const targetWs = this.findWebSocketBySessionId(targetEntry.sessionId);
              if (targetWs) {
                targetWs.send(JSON.stringify({
                  type: 'log',
                  data: this.formatLog('[' + sender + '->YOU]: ' + dmMsg, 40, true),
                }));
              }
              this.sendToSession(sessionId, {
                type: 'log',
                data: this.formatLog('[YOU->' + targetName + ']: ' + dmMsg, 40),
              });
            } else {
              this.sendToSession(sessionId, { type: 'log', data: this.formatLog('Player not found!') });
            }
            return;
          }

          // Commands
          if (message.startsWith('/')) {
            if (message.startsWith('/list')) {
              const names: string[] = [];
              this.IDToName.forEach(v => names.push(v));
              this.sendToSession(sessionId, { type: 'log', data: this.formatLog('Online: ' + names.join(', ')) });
            } else if (message.startsWith('/help')) {
              this.sendToSession(sessionId, {
                type: 'log',
                data: this.formatLog('DM players with >{user} {message}\nSee the online player list with /list!\nTo view someone\'s profile use /profile <user>'),
              });
            } else if (message.startsWith('/announce')) {
              const userId = this.SSIDtoID.get(sessionId);
              if (userId) {
                try {
                  const user = await import('../db/queries').then(m => m.getPlayerByID(this.env, userId));
                  const { hasAccess } = await import('../config');
                  if (user && hasAccess(user, 'command.announce')) {
                    this.broadcastNotification(message.substring('/announce '.length));
                  }
                } catch (_) {}
              }
            } else {
              this.sendToSession(sessionId, { type: 'log', data: this.formatLog('Command not found! (Try /help)') });
            }
            return;
          }

          // Public chat
          const chatLog = this.formatLog(sender + ': ' + message, this.nameToHue.get(sender.toLowerCase()));
          await this.logToAll(chatLog);
          await this.sendToDiscord(message, sender);
          break;
        }
        case 'inviteplayertoroom': {
          const entry = this.IDtoClient.get(this.SSIDtoID.get(sessionId) || '');
          if (!entry) {
            this.sendToSession(sessionId, { type: 'notification', data: 'Authorization Error' });
            this.removePlayer(sessionId);
            return;
          }

          const targetName = msg.data;
          const targetEntry = this.nameToClient.get(targetName.toLowerCase());
          if (!targetEntry) {
            this.sendToSession(sessionId, { type: 'notification', data: "Player isn't online in-game!" });
            return;
          }

          const senderName = entry.name;
          const targetWs = this.findWebSocketBySessionId(targetEntry.sessionId);
          if (targetWs) {
            // Get the room the sender is in (simplified - in production would query room registry)
            targetWs.send(JSON.stringify({
              type: 'roominvite',
              data: JSON.stringify({ name: senderName, roomid: 'TODO' }),
            }));
          }
          this.sendToSession(sessionId, { type: 'notification', data: 'Invite sent!' });
          break;
        }
        case 'loggedMessagesAfter': {
          const after = msg.data || 0;
          const loggedAfter: string[] = [];
          for (const [content, timestamp] of this.loggedMessages) {
            if (timestamp > after) {
              loggedAfter.push(content);
            }
          }
          this.sendToSession(sessionId, { type: 'batchLog', data: JSON.stringify(loggedAfter) });
          break;
        }
      }
    } catch (err) {
      console.error('NetworkRoom message error:', err);
    }
  }

  async handleAuth(ws: WebSocket, data: any): Promise<{ ok: boolean; error?: string; code?: number }> {
    const { protocol, networkId, networkToken } = data;

    if (protocol !== this.PROTOCOL_VERSION) {
      return { ok: false, error: 'Protocol version mismatch!', code: 5003 };
    }

    if (!networkId || !networkToken) {
      return { ok: false, error: 'Unauthorized to Network', code: 401 };
    }

    const { getPlayerByID, authPlayer } = await import('../db/queries');
    const player = await getPlayerByID(this.env, networkId);
    if (!player) {
      return { ok: false, error: 'Unauthorized to Network', code: 401 };
    }

    const { verifyToken } = await import('../auth');
    const valid = await verifyToken(networkToken, player.secret);
    if (!valid) {
      return { ok: false, error: 'Unauthorized to Network', code: 401 };
    }

    // Disconnect existing session
    if (this.IDToName.has(player.id)) {
      const existingEntry = this.IDtoClient.get(player.id);
      if (existingEntry) {
        this.removePlayer(existingEntry.sessionId);
      }
    }

    const sessionId = crypto.randomUUID();
    (ws as any).__sessionId = sessionId;

    this.SSIDtoID.set(sessionId, player.id);
    this.IDToName.set(player.id, player.name);
    this.IDtoClient.set(player.id, {
      sessionId,
      userId: player.id,
      name: player.name,
      hue: player.profile_hue ?? 250,
      lastActive: Date.now(),
    });
    this.nameToClient.set(player.name.toLowerCase(), this.IDtoClient.get(player.id)!);
    this.nameToHue.set(player.name.toLowerCase(), player.profile_hue ?? 250);

    ws.send(JSON.stringify({
      type: 'log',
      data: this.formatLog('Welcome, ' + player.name + '!\nYou should also check /help!'),
    }));

    return { ok: true };
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    const sessionId = (ws as any).__sessionId;
    if (!sessionId) return;

    if (!wasClean) {
      try {
        await new Promise(resolve => setTimeout(resolve, 10000));
      } catch (_) {}
    }

    this.removePlayer(sessionId);
  }

  removePlayer(sessionId: string) {
    try {
      const userId = this.SSIDtoID.get(sessionId);
      this.SSIDtoID.delete(sessionId);
      if (userId) {
        this.IDtoClient.delete(userId);
        if (this.IDToName.has(userId)) {
          const name = this.IDToName.get(userId)!;
          this.nameToClient.delete(name.toLowerCase());
          this.nameToHue.delete(name.toLowerCase());
          this.IDToName.delete(userId);
        }
      }
    } catch (err) {
      console.error('NetworkRoom removePlayer error:', err);
    }

    // Close the WebSocket
    for (const ws of this.ctx.getWebSockets()) {
      if ((ws as any).__sessionId === sessionId) {
        try { ws.close(); } catch (_) {}
      }
    }
  }

  notifyPlayer(toId: string, content: string) {
    const entry = this.IDtoClient.get(toId);
    if (!entry) return;

    const ws = this.findWebSocketBySessionId(entry.sessionId);
    if (ws && ws.readyState === 1) {
      try {
        ws.send(JSON.stringify({ type: 'notification', data: content }));
      } catch (_) {}
    }
  }

  async logToAll(content: string, notDiscord = false) {
    this.loggedMessages.push([content, Date.now()]);
    if (this.loggedMessages.length > 100) {
      this.loggedMessages.shift();
    }
    await this.ctx.storage.put('loggedMessages', this.loggedMessages);

    // Broadcast to all connected WebSockets
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState === 1) {
        try {
          ws.send(JSON.stringify({ type: 'log', data: content }));
        } catch (_) {}
      }
    }

    if (!notDiscord) {
      try {
        const parsed = JSON.parse(content);
        await this.sendToDiscord(parsed.content);
      } catch (_) {}
    }
  }

  broadcastNotification(content: string) {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState === 1) {
        try {
          ws.send(JSON.stringify({ type: 'notification', data: content }));
        } catch (_) {}
      }
    }
  }

  async sendToDiscord(content: string, username?: string) {
    const webhookUrl = (this.env as any).DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return;

    try {
      let filteredContent = content
        .replaceAll('<@', '?')
        .replaceAll('@everyone', '?')
        .replaceAll('@here', '?');

      const body: any = { content: filteredContent };
      if (username) {
        body.username = username;
      }

      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      console.error('Discord webhook error:', err);
    }
  }

  formatLog(content: string, hue: number | null = null, isPM = false): string {
    return JSON.stringify({ content, hue, date: Date.now(), isPM });
  }

  sendToSession(sessionId: string, message: any) {
    for (const ws of this.ctx.getWebSockets()) {
      if ((ws as any).__sessionId === sessionId && ws.readyState === 1) {
        try { ws.send(JSON.stringify(message)); } catch (_) {}
      }
    }
  }

  findWebSocketBySessionId(sessionId: string): WebSocket | null {
    for (const ws of this.ctx.getWebSockets()) {
      if ((ws as any).__sessionId === sessionId && ws.readyState === 1) {
        return ws;
      }
    }
    return null;
  }
}
