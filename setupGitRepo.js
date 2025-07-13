const fs = require('fs');
const path = require('path');
const simpleGit = require('simple-git');
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const chalk = require('chalk');

const sessionPath = './session';
const git = simpleGit();
let anas;
let isWhatsAppConnected = false;

// 💠 Auto hapus session lokal
function deleteSession() {
  if (fs.existsSync(sessionPath)) {
    const stat = fs.statSync(sessionPath);
    if (stat.isDirectory()) {
      fs.readdirSync(sessionPath).forEach(file => {
        fs.unlinkSync(path.join(sessionPath, file));
      });
      fs.rmdirSync(sessionPath);
      console.log('🗑️ Folder session berhasil dihapus.');
    } else {
      fs.unlinkSync(sessionPath);
      console.log('🗑️ File session berhasil dihapus.');
    }
    return true;
  } else {
    console.log('⚠️ Session tidak ditemukan.');
    return false;
  }
}

// 💠 Auto config Git user jika belum
async function configureGitUser() {
  try {
    const config = await git.listConfig();
    const userName = config.all['user.name'];
    const userEmail = config.all['user.email'];
    if (!userName || !userEmail) {
      await git.addConfig('user.name', 'Kepforannas');
      await git.addConfig('user.email', 'kepforannas@whatsappbot.id');
      console.log('✅ Git user.name & email diset otomatis.');
    }
  } catch (err) {
    console.error('❌ Gagal set config Git:', err.message);
  }
}

// 💠 Inisialisasi Git dan push awal (tanpa .gitkeep)
async function initOrUpdateGitRepo() {
  try {
    await configureGitUser();

    // Buat folder & file dummy session kalau belum ada
    if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });
    const dummyFile = path.join(sessionPath, 'creds.json');
    if (!fs.existsSync(dummyFile)) fs.writeFileSync(dummyFile, '{}');

    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      await git.init();
      await git.add('./*');
      await git.commit('Initial commit from bot');
      await git.branch(['-M', 'main']);
      await git.addRemote('origin', 'https://github.com/Annasddos/token.git');
      await git.push('origin', 'main');
      console.log('✅ Repo Git kosong berhasil diisi & siap dipakai.');
    } else {
      const remotes = await git.getRemotes(true);
      const originExists = remotes.some(r => r.name === 'origin');
      if (!originExists) {
        await git.addRemote('origin', 'https://github.com/Annasddos/token.git');
      }
    }
  } catch (error) {
    console.error('❌ Gagal inisialisasi Git:', error.message);
  }
}

// 💠 Push session ke GitHub
async function saveSessionToGit() {
  try {
    const files = fs.readdirSync(sessionPath);
    if (files.length > 0) {
      await git.add(path.join(sessionPath, '*'));
      const status = await git.status();
      if (status.files.length > 0) {
        console.log('📦 Commit sesi ke Git...');
        await git.commit('Update WhatsApp session');
        await git.push('origin', 'main');
        console.log('🚀 Sesi berhasil didorong ke GitHub.');
      } else {
        console.log('ℹ️ Tidak ada perubahan pada sesi.');
      }
    }
  } catch (error) {
    console.error('❌ Gagal push sesi ke GitHub:', error.message);
  }
}

// 💠 Start sesi WhatsApp
const startSesi = async () => {
  await initOrUpdateGitRepo();

  try {
    console.log('🔁 Tarik sesi dari GitHub...');
    await git.pull('origin', 'main');
    console.log('✅ Sesi berhasil ditarik dari GitHub.');
  } catch (err) {
    console.warn('⚠️ Pull gagal (repo kosong mungkin):', err.message);
    if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const connectionOptions = {
    version,
    keepAliveIntervalMs: 30000,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    auth: state,
    browser: ["Mac OS", "Safari", "10.15.7"],
    getMessage: async () => ({ conversation: "P" }),
  };

  anas = makeWASocket(connectionOptions);

  // Save creds dan auto push setiap update session
  anas.ev.on("creds.update", async () => {
    saveCreds();
    await saveSessionToGit();
  });

  // Update koneksi
  anas.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "open") {
      isWhatsAppConnected = true;
      console.log(chalk.green.bold("\n📲 WHATSAPP TERHUBUNG\n"));
    }

    if (connection === "close") {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log(chalk.red.bold("\n📴 WHATSAPP TERPUTUS"));
      if (shouldReconnect) {
        console.log(chalk.yellow.bold("🔁 Menghubungkan ulang..."));
        startSesi();
      }
      isWhatsAppConnected = false;
    }
  });
};

startSesi();