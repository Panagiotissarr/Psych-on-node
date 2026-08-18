import { Env } from '../env';

interface GameState {
  song: string;
  folder: string;
  diff: number;
  diffList: string[];
  stageName: string;
  stageMod: string;
  stageURL: string;
  modDir: string;
  modURL: string;
  host: string | null;
  isPrivate: boolean;
  networkOnly: boolean;
  isStarted: boolean;
  anarchyMode: boolean;
  allPlayersChoose: boolean;
  health: number;
  gameplaySettings: Record<string, string>;
  hideGF: boolean;
  winCondition: number;
  teamMode: boolean;
  disableSkins: boolean;
  royalMode: boolean;
  royalModeDadSide: boolean;
}

interface PlayerState {
  name: string;
  ox: number;
  score: number;
  misses: number;
  sicks: number;
  goods: number;
  bads: number;
  shits: number;
  songPoints: number;
  maxCombo: number;
  bfSide: boolean;
  hasEnded: boolean;
  isReady: boolean;
  skin: string[];
  skinURL: string | null;
  points: number;
  botplay: boolean;
  noteHold: boolean;
  hasSong: boolean;
  hasLoaded: boolean;
  verified: boolean;
  status: string;
  ping: number;
  noteSkin: string | null;
  noteSkinMod: string | null;
  noteSkinURL: string | null;
  gameplaySettings: Record<string, string>;
  arrowColors: Record<string, number[]>;
  arrowColorsPixel: Record<string, number[]>;
}

interface ClientInfo {
  ip: string;
  networkId: string | null;
  hue: number;
  lastPing: number;
  aliveTime: number;
  networkToken: string | null;
}

interface ChatMessage {
  content: string;
  hue: number | null;
  date: number;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export class GameRoomDO {
  state: Env;
  ctx: DurableObjectState;
  roomId: string;
  meta: Record<string, any> = {};
  players: Map<string, PlayerState> = new Map();
  clientsInfo: Map<string, ClientInfo> = new Map();
  clientsRemoved: string[] = [];
  loggedMessages: ChatMessage[] = [];
  lastPingTime: number = 0;
  dummies: PlayerState[] = [];
  chartHash: string | null = null;
  ips: Map<string, number> = new Map();
  lobbyIds: Set<string> = new Set();
  maxClients = 6;
  PROTOCOL_VERSION = 11;

  constructor(state: DurableObjectState, env: Env) {
    this.ctx = state;
    this.state = env;
    this.roomId = state.id.toString().slice(0, 4).toUpperCase();

    // Restore state from storage
    this.ctx.blockConcurrencyWhile(async () => {
      const savedState = await this.ctx.storage.get<GameState>('gameState');
      if (savedState) {
        this.meta = savedState as any;
      }
      const savedPlayers = await this.ctx.storage.get<Map<string, PlayerState>>('players');
      if (savedPlayers) {
        this.players = new Map(Object.entries(savedPlayers as any));
      }
    });

    // Setup alarm for ping checks
    this.ctx.storage.setAlarm(Date.now() + 60000);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/ws') {
      // WebSocket upgrade
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];
      this.ctx.acceptWebSocket(server);
      this.handleConnection(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (path === '/info') {
      return Response.json({
        roomId: this.roomId,
        meta: this.meta,
        clients: this.clientsInfo.size,
        maxClients: this.maxClients,
      });
    }

    if (path === '/create') {
      const body = await request.json<any>();
      this.meta = {
        name: body.name || 'Room',
        networkOnly: body.networkOnly || false,
        isPrivate: true,
        clients: 0,
        maxClients: this.maxClients,
      };
      this.players.clear();
      this.chartHash = null;
      this.clientsRemoved = [];
      this.loggedMessages = [];
      return Response.json({ roomId: this.roomId });
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  async handleConnection(ws: WebSocket) {
    // Connection handling is done via messages
  }

  async webSocketMessage(ws: WebSocket, rawMsg: string | ArrayBuffer) {
    try {
      const msg = typeof rawMsg === 'string' ? JSON.parse(rawMsg) : JSON.parse(new TextDecoder().decode(rawMsg));
      const sessionId = (ws as any).__sessionId || '';
      const clientInfo = this.clientsInfo.get(sessionId);

      switch (msg.type) {
        case 'auth': {
          const result = await this.handleAuth(ws, msg.data);
          if (!result.ok) {
            ws.send(JSON.stringify({ type: 'error', data: result.error }));
            ws.close(result.code || 4000, result.error);
          }
          break;
        }
        case 'togglePrivate': {
          if (this.isOwner(sessionId) || this.meta.anarchyMode) {
            this.meta.isPrivate = !this.meta.isPrivate;
            this.broadcastState();
          }
          break;
        }
        case 'toggleNetworkOnly': {
          if (this.isOwner(sessionId) || this.meta.anarchyMode) {
            this.meta.networkOnly = !this.meta.networkOnly;
            this.broadcastState();
          }
          break;
        }
        case 'startGame': {
          const player = this.players.get(sessionId);
          if (player && player.hasSong) {
            player.isReady = !player.isReady;
            for (const dummy of this.dummies) {
              dummy.isReady = player.isReady;
              dummy.hasSong = player.hasSong;
            }
          }
          await this.tryStartGame();
          break;
        }
        case 'addScore': {
          const p = this.players.get(sessionId);
          if (p && this.meta.isStarted && typeof msg.data === 'number') {
            p.score += msg.data;
          }
          break;
        }
        case 'addMiss': {
          const p = this.players.get(sessionId);
          if (p && this.meta.isStarted) {
            p.misses += 1;
          }
          break;
        }
        case 'addHitJudge': {
          const p = this.players.get(sessionId);
          if (p && this.meta.isStarted && typeof msg.data === 'string') {
            switch (msg.data) {
              case 'sick': p.sicks += 1; break;
              case 'good': p.goods += 1; break;
              case 'bad': p.bads += 1; break;
              case 'shit': p.shits += 1; break;
            }
          }
          break;
        }
        case 'setSong': {
          if (this.isOwner(sessionId) || this.meta.anarchyMode || this.meta.allPlayersChoose) {
            const d = msg.data;
            if (Array.isArray(d) && d.length >= 6) {
              this.meta.folder = d[0];
              this.meta.song = d[1];
              this.meta.diff = d[2];
              this.chartHash = d[3];
              this.meta.modDir = d[4];
              this.meta.modURL = d[5];
              this.meta.diffList = d[6] || [];

              for (const [sid, player] of this.players) {
                player.isReady = false;
                player.hasSong = sid === sessionId;
              }

              const requester = this.players.get(sessionId);
              if (requester) {
                this.broadcastLog(requester.name + ' has picked song: "' + this.meta.song + '"');
              }
              this.broadcast({ type: 'checkChart' });
            }
          }
          break;
        }
        case 'setStage': {
          if (this.isOwner(sessionId) || this.meta.anarchyMode || this.meta.allPlayersChoose) {
            const d = msg.data;
            if (Array.isArray(d) && d.length >= 2) {
              this.meta.stageName = d[0];
              this.meta.stageMod = d[1];
              this.meta.stageURL = d[2];

              for (const [, player] of this.players) {
                player.isReady = false;
              }

              const requester = this.players.get(sessionId);
              if (requester) {
                this.broadcastLog(requester.name + ' has picked stage: "' + this.meta.stageName + '"');
              }
              this.broadcast({ type: 'checkStage' });
            }
          }
          break;
        }
        case 'verifyChart': {
          const p = this.players.get(sessionId);
          if (p && typeof msg.data === 'string') {
            p.hasSong = this.chartHash === msg.data;
          }
          break;
        }
        case 'strumPlay':
        case 'charPlay':
        case 'noteHit':
        case 'noteMiss':
        case 'custom': {
          this.broadcast({ type: msg.type, data: [sessionId, msg.data] }, ws);
          if (msg.type === 'noteHit') {
            if (this.playerOnBFSide(sessionId)) {
              this.meta.health = (this.meta.health || 1) - 0.023;
            } else {
              this.meta.health = (this.meta.health || 1) + 0.023;
            }
            this.meta.health = Math.max(0, Math.min(2, this.meta.health));
          }
          if (msg.type === 'noteMiss') {
            if (this.playerOnBFSide(sessionId)) {
              this.meta.health = (this.meta.health || 1) + 0.0475;
            } else {
              this.meta.health = (this.meta.health || 1) - 0.0475;
            }
            this.meta.health = Math.max(0, Math.min(2, this.meta.health));
          }
          break;
        }
        case 'customTo': {
          const data = msg.data;
          if (Array.isArray(data) && data.length >= 2) {
            const to = data[0];
            for (const [sid] of this.players) {
              if (sid === to) {
                const targetWs = this.findWebSocketBySessionId(sid);
                if (targetWs) {
                  targetWs.send(JSON.stringify({ type: 'custom', data: [sessionId, data[1]] }));
                }
                break;
              }
            }
          }
          break;
        }
        case 'playerReady': {
          const p = this.players.get(sessionId);
          if (p && !p.hasLoaded) {
            this.broadcastLog(p.name + ' is ready!');
            p.hasLoaded = true;
            for (const dummy of this.dummies) {
              dummy.hasLoaded = true;
            }
            let allReady = true;
            for (const [, pl] of this.players) {
              if (!pl.hasLoaded) { allReady = false; break; }
            }
            if (allReady) {
              this.broadcast({ type: 'startSong' });
            }
          }
          break;
        }
        case 'playerEnded': {
          const p = this.players.get(sessionId);
          if (p) {
            p.hasEnded = true;
            for (const dummy of this.dummies) {
              dummy.hasEnded = true;
            }
            let allEnded = true;
            for (const [, pl] of this.players) {
              if (!pl.hasEnded) { allEnded = false; break; }
            }
            if (allEnded) {
              await this.endSong();
            }
          }
          break;
        }
        case 'noteHold': {
          const p = this.players.get(sessionId);
          if (p && typeof msg.data === 'boolean') {
            p.noteHold = msg.data;
          }
          break;
        }
        case 'updateSongFP': {
          const p = this.players.get(sessionId);
          if (p && typeof msg.data === 'number') {
            p.songPoints = msg.data;
          }
          break;
        }
        case 'updateMaxCombo': {
          const p = this.players.get(sessionId);
          if (p && typeof msg.data === 'number') {
            p.maxCombo = msg.data;
          }
          break;
        }
        case 'chat': {
          if (typeof msg.data === 'string' && msg.data.length > 0 && msg.data.length < 300) {
            const p = this.players.get(sessionId);
            if (p) {
              const chatMsg = msg.data.replaceAll('\n', ' ');
              const detail = p.name + ': ' + chatMsg;
              this.loggedMessages.push({ content: detail, hue: clientInfo?.hue ?? 250, date: Date.now() });
              this.broadcast({ type: 'log', data: this.formatLog(detail, clientInfo?.hue) });
            }
          }
          break;
        }
        case 'pong': {
          if (clientInfo) {
            const daPing = Date.now() - this.lastPingTime;
            const p = this.players.get(sessionId);
            if (p) p.ping = daPing;
            if (this.isOwner(sessionId)) {
              this.meta.ping = daPing;
            }
            clientInfo.lastPing = Date.now();
          }
          break;
        }
        case 'swapSides': {
          const p = this.players.get(sessionId);
          if (p) {
            p.isReady = false;
            p.bfSide = !p.bfSide;
            this.updateSides();
            this.broadcastState();
          }
          break;
        }
        case 'anarchyMode':
        case 'togglePlayersCanChoose':
        case 'teamMode':
        case 'royalMode':
        case 'royalModeDadSide':
        case 'toggleGF': {
          if (this.isOwner(sessionId) || this.meta.anarchyMode) {
            const key = msg.type;
            this.meta[key] = !this.meta[key];
            this.broadcastState();
          }
          break;
        }
        case 'toggleSkins': {
          if (this.isOwner(sessionId) || this.meta.anarchyMode) {
            this.meta.disableSkins = !this.meta.disableSkins;
            if (this.meta.disableSkins) {
              for (const [, player] of this.players) {
                player.skin = [];
                player.skinURL = null;
              }
            }
            this.broadcastState();
          }
          break;
        }
        case 'nextWinCondition': {
          if (this.isOwner(sessionId) || this.meta.anarchyMode) {
            let c = (this.meta.winCondition || 0) + 1;
            if (c > 4) c = 0;
            this.meta.winCondition = c;
            this.broadcastState();
          }
          break;
        }
        case 'requestEndSong': {
          if (this.players.has(sessionId)) {
            await this.endSong();
          }
          break;
        }
        case 'setGameplaySetting': {
          if (Array.isArray(msg.data) && msg.data.length >= 2) {
            const p = this.players.get(sessionId);
            if (p) {
              p.gameplaySettings = p.gameplaySettings || {};
              p.gameplaySettings[msg.data[0]] = String(msg.data[1]);
              if (this.isOwner(sessionId) || this.meta.anarchyMode) {
                this.meta.gameplaySettings = this.meta.gameplaySettings || {};
                this.meta.gameplaySettings[msg.data[0]] = String(msg.data[1]);
              }
            }
          }
          break;
        }
        case 'setSkin': {
          const p = this.players.get(sessionId);
          if (p && !this.meta.disableSkins) {
            if (Array.isArray(msg.data) && msg.data.length >= 1) {
              p.skin = msg.data[0] || [];
              p.skinURL = msg.data[1] || null;
            }
          }
          break;
        }
        case 'status': {
          if (typeof msg.data === 'string' && msg.data.length < 30) {
            const p = this.players.get(sessionId);
            if (p) p.status = msg.data;
          }
          break;
        }
        case 'botplay': {
          const p = this.players.get(sessionId);
          if (p) p.botplay = true;
          break;
        }
        case 'updateArrColors': {
          const p = this.players.get(sessionId);
          if (p && Array.isArray(msg.data)) {
            try {
              for (const [i, maniaColors] of msg.data.entries()) {
                for (const [mania, colors] of Object.entries(maniaColors as any)) {
                  const flat = (colors as number[][]).flat();
                  if (i === 0) {
                    p.arrowColors = p.arrowColors || {};
                    p.arrowColors[mania] = flat;
                  } else {
                    p.arrowColorsPixel = p.arrowColorsPixel || {};
                    p.arrowColorsPixel[mania] = flat;
                  }
                }
              }
            } catch (_) {}
          }
          break;
        }
        case 'updateNoteSkinData': {
          const p = this.players.get(sessionId);
          if (p && Array.isArray(msg.data) && msg.data.length >= 2) {
            p.noteSkin = msg.data[0];
            p.noteSkinMod = msg.data[1];
            p.noteSkinURL = msg.data[2];
          }
          break;
        }
        case 'command': {
          if (Array.isArray(msg.data) && msg.data.length >= 1) {
            const p = this.players.get(sessionId);
            if (!p) break;
            const cmd = msg.data[0];
            switch (cmd) {
              case 'roll':
                this.broadcastLog('> ' + p.name + ' has rolled ' + (Math.floor(Math.random() * 6) + 1));
                break;
              case 'kick': {
                if (!this.isOwner(sessionId)) {
                  this.sendToSession(sessionId, { type: 'log', data: this.formatLog('> Just leave the game bro') });
                  break;
                }
                const username = msg.data.slice(1).join(' ').toLowerCase();
                let kickCount = 0;
                for (const [clSID, clPlayer] of this.players) {
                  if (clSID !== this.meta.host && (!username || clPlayer.name.toLowerCase() === username)) {
                    this.removePlayerBySessionId(clSID);
                    kickCount++;
                  }
                }
                this.sendToSession(sessionId, { type: 'log', data: this.formatLog('> Kicked ' + kickCount + ' people') });
                break;
              }
              case 'report': {
                // Simplified report - store in D1
                const info = this.clientsInfo.get(sessionId);
                if (info) {
                  try {
                    await this.state.DB.prepare(
                      "INSERT INTO reports (id, content, by) VALUES (?, ?, ?)"
                    ).bind(
                      crypto.randomUUID(),
                      JSON.stringify({ roomId: this.roomId, messages: this.loggedMessages }),
                      info.networkId || info.ip
                    ).run();
                    this.loggedMessages = [];
                    this.sendToSession(sessionId, { type: 'log', data: this.formatLog('> Report Submitted!') });
                  } catch (_) {}
                }
                break;
              }
              case 'addDummy':
              case 'addDummies': {
                const count = cmd === 'addDummies' ? (msg.data[1] || 1) : 1;
                for (let i = 0; i < count; i++) {
                  if (this.players.size >= this.maxClients) break;
                  const dummy: PlayerState = {
                    name: 'Dummy' + this.dummies.length,
                    ox: 0, score: 0, misses: 0, sicks: 0, goods: 0, bads: 0, shits: 0,
                    songPoints: 0, maxCombo: 0, bfSide: false, hasEnded: false, isReady: false,
                    skin: [], skinURL: null, points: 0, botplay: false, noteHold: false,
                    hasSong: false, hasLoaded: false, verified: false, status: '', ping: 0,
                    noteSkin: null, noteSkinMod: null, noteSkinURL: null,
                    gameplaySettings: {}, arrowColors: {}, arrowColorsPixel: {},
                  };
                  this.dummies.push(dummy);
                  this.players.set(dummy.name, dummy);
                  this.updateSides();
                }
                this.broadcastState();
                break;
              }
              case 'help':
                this.sendToSession(sessionId, { type: 'log', data: this.formatLog('> Global Commands: /roll, /kick <name>, /report') });
                break;
              default:
                this.sendToSession(sessionId, { type: 'log', data: this.formatLog('> Unknown command; try /help to see the command list!') });
            }
          }
          break;
        }
        case 'updateFP': {
          const p = this.players.get(sessionId);
          if (p && typeof msg.data === 'number' && clientInfo?.networkId) {
            try {
              const { getUserStats } = await import('../db/queries');
              const stats = await getUserStats(this.state, clientInfo.networkId);
              if (stats) {
                p.points = stats.points_4k;
                const user = await import('../db/queries').then(m => m.getPlayerByID(this.state, clientInfo.networkId!));
                if (user) p.name = user.name;
              }
            } catch (_) {
              p.points = msg.data;
            }
          } else if (p && typeof msg.data === 'number') {
            p.points = msg.data;
          }
          if (this.isOwner(sessionId)) {
            this.meta.points = this.players.get(sessionId)?.points;
          }
          break;
        }
      }
    } catch (err) {
      console.error('GameRoom message error:', err);
    }
  }

  async handleAuth(ws: WebSocket, data: any): Promise<{ ok: boolean; error?: string; code?: number }> {
    const { name, points, networkId, networkToken, protocol, skin, skinURL, arrowRGB, noteSkin, noteSkinMod, noteSkinURL, gameplaySettings } = data;

    if (!name || name.trim().length < 3) return { ok: false, error: 'Too short name!', code: 5000 };
    if (name.length > 14) return { ok: false, error: 'Too long name!', code: 5001 };
    if (protocol !== this.PROTOCOL_VERSION) return { ok: false, error: 'Protocol version mismatch!', code: 5003 };

    const sessionId = crypto.randomUUID();
    (ws as any).__sessionId = sessionId;

    let isVerified = false;
    let playerName = name;
    let playerPoints = points || 0;
    let playerHue = 250;

    if (networkId && networkToken && this.state.NETWORK_ENABLED === 'true') {
      try {
        const { getPlayerByID, getUserStats } = await import('../db/queries');
        const { verifyToken } = await import('../auth');
        const player = await getPlayerByID(this.state, networkId);
        if (player) {
          const valid = await verifyToken(networkToken, player.secret);
          if (valid) {
            isVerified = true;
            playerName = player.name;
            playerHue = player.profile_hue ?? 250;
            const stats = await getUserStats(this.state, networkId);
            if (stats) playerPoints = stats.points_4k;
          }
        }
      } catch (_) {}
    }

    if (!isVerified && this.meta.networkOnly) {
      return { ok: false, error: 'Only Registered Network players can join!', code: 4000 };
    }

    // Track IP
    const ip = '0.0.0.0'; // Will be set from client info
    this.clientsInfo.set(sessionId, {
      ip,
      networkId: isVerified ? networkId : null,
      hue: playerHue,
      lastPing: Date.now(),
      aliveTime: Date.now(),
      networkToken: isVerified ? networkToken : null,
    });

    // Create player
    const player: PlayerState = {
      name: playerName,
      ox: 0, score: 0, misses: 0, sicks: 0, goods: 0, bads: 0, shits: 0,
      songPoints: 0, maxCombo: 0, bfSide: false, hasEnded: false, isReady: false,
      skin: skin || [], skinURL: skinURL || null, points: playerPoints,
      botplay: false, noteHold: false, hasSong: false, hasLoaded: false,
      verified: isVerified, status: '', ping: 0,
      noteSkin: noteSkin || null, noteSkinMod: noteSkinMod || null,
      noteSkinURL: noteSkinURL || null,
      gameplaySettings: gameplaySettings || {}, arrowColors: {}, arrowColorsPixel: {},
    };

    // Set sides
    const sideCount = [0, 0];
    for (const [, p] of this.players) {
      sideCount[p.bfSide ? 1 : 0]++;
    }
    player.bfSide = sideCount[0] > sideCount[1];

    this.players.set(sessionId, player);
    this.updateSides();

    if (!this.meta.host) {
      this.meta.host = sessionId;
      this.meta.points = playerPoints;
      this.meta.verified = isVerified;
    }

    this.updateMetaClients();

    // Send initial state
    ws.send(JSON.stringify({ type: 'authOk', data: { sessionId, roomId: this.roomId } }));
    this.broadcastState();
    this.broadcastLog(playerName + ' has joined the room!');
    ws.send(JSON.stringify({ type: 'checkChart' }));

    return { ok: true };
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    const sessionId = (ws as any).__sessionId;
    if (!sessionId) return;

    if (!wasClean && !this.clientsRemoved.includes(sessionId)) {
      // Allow reconnection - wait 20 seconds
      await new Promise(resolve => setTimeout(resolve, 20000));
    }

    this.removePlayerBySessionId(sessionId);
  }

  removePlayerBySessionId(sessionId: string) {
    const player = this.players.get(sessionId);
    if (player) {
      this.broadcastLog(player.name + ' has left the room!');
    }

    this.clientsInfo.delete(sessionId);
    this.clientsRemoved.push(sessionId);
    this.players.delete(sessionId);
    this.updateSides();

    // Remove from IP tracking
    const info = this.clientsInfo.get(sessionId);
    if (info) {
      const count = this.ips.get(info.ip) || 0;
      if (count > 1) this.ips.set(info.ip, count - 1);
      else this.ips.delete(info.ip);
    }

    this.updateMetaClients();

    // Close the WebSocket
    for (const ws of this.ctx.getWebSockets()) {
      if ((ws as any).__sessionId === sessionId) {
        try { ws.close(); } catch (_) {}
      }
    }

    if (this.players.size < 1) {
      this.ctx.storage.deleteAll();
      this.ctx.abort();
    } else if (sessionId === this.meta.host) {
      for (const [sid] of this.players) {
        this.meta.host = sid;
        break;
      }
    }
  }

  async endSong() {
    for (const [, player] of this.players) {
      player.isReady = false;
      player.botplay = false;
    }
    this.meta.isStarted = false;
    this.broadcast({ type: 'endSong' });
    this.broadcastState();
  }

  async tryStartGame() {
    const sideCount = [0, 0];
    for (const [, player] of this.players) {
      if (!player.isReady || !player.hasSong) return;
      sideCount[player.bfSide ? 1 : 0]++;
    }
    for (const count of sideCount) {
      if (count > this.maxClients / 2) return;
    }

    for (const [, player] of this.players) {
      player.score = 0;
      player.misses = 0;
      player.sicks = 0;
      player.goods = 0;
      player.bads = 0;
      player.shits = 0;
      player.songPoints = 0;
      player.hasLoaded = false;
      player.hasEnded = false;
      player.isReady = false;
    }

    this.meta.isStarted = true;
    this.meta.health = 1;
    this.broadcast({ type: 'gameStarted' });
    this.broadcastState();
  }

  broadcast(message: any, except?: WebSocket) {
    const data = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== except && ws.readyState === 1) {
        try { ws.send(data); } catch (_) {}
      }
    }
  }

  broadcastLog(content: string, hue: number | null = null) {
    this.broadcast({ type: 'log', data: this.formatLog(content, hue) });
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

  broadcastState() {
    const playersObj: Record<string, any> = {};
    for (const [sid, p] of this.players) {
      playersObj[sid] = p;
    }
    this.broadcast({
      type: 'state',
      data: {
        ...this.meta,
        players: playersObj,
      },
    });
  }

  isOwner(sessionId: string): boolean {
    return sessionId === this.meta.host;
  }

  playerOnBFSide(sessionId: string): boolean {
    const p = this.players.get(sessionId);
    return p ? !p.bfSide : false;
  }

  updateSides() {
    const sideCount = [0, 0];
    for (const [, player] of this.players) {
      player.ox = sideCount[player.bfSide ? 1 : 0]++;
    }
  }

  updateMetaClients() {
    this.meta.clients = this.players.size;
    this.meta.maxClients = this.maxClients;
  }

  async alarm() {
    const now = Date.now();

    // Check for empty rooms
    if (this.players.size < 1) {
      this.ctx.storage.deleteAll();
      this.ctx.abort();
      return;
    }

    // Check for unresponsive players
    for (const [sessionId, info] of this.clientsInfo) {
      if (now - info.lastPing > 60000) {
        this.removePlayerBySessionId(sessionId);
      }
      if (now - info.aliveTime > 1200000) {
        this.removePlayerBySessionId(sessionId);
      }
    }

    // Ping all clients
    this.lastPingTime = now;
    this.broadcast({ type: 'ping' });

    // Save state
    await this.ctx.storage.put('gameState', this.meta as any);

    // Reset alarm
    this.ctx.storage.setAlarm(now + 60000);
  }
}
